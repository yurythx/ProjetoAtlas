import { useRef, useEffect, useCallback } from "react"
import { api } from "@/lib/axios"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { notify } from "@/lib/notifications"
import { toast } from "sonner"
import { isJwtExpired } from "@/lib/jwt"
import { ensureFreshAccessToken } from "@/lib/ws-auth"

// Singleton WS e toast-dedupe cache (prevenir conexões/toasts duplicados)
let WS_SINGLETON: WebSocket | null = null
let WS_INITIALIZED = false
const SHOWN_TOASTS = new Map<string, number>() // key -> timestamp
const TOAST_TTL_MS = 60_000

// Bug N4: backoff exponencial — estado global para controle de reconexões
let WS_RETRY_COUNT = 0
const WS_MAX_RETRIES = 8
const WS_BASE_DELAY_MS = 3_000

export interface Notification {
    id: string
    notification_type: 'message' | 'system' | 'approval'
    priority: 'low' | 'medium' | 'high' | 'urgent'
    module?: string | null
    icon?: string | null
    title: string
    message: string
    link?: string
    aggregate_key?: string | null
    aggregate_count?: number
    metadata?: Record<string, unknown> | null
    is_read: boolean
    created_at: string
}

type WSNotificationEvent = {
    type?: string
    notification_type?: 'message' | 'system' | 'approval'
    title?: string
    message?: string
    link?: string
    conversation_id?: number
    conversation?: { id?: number }
    message_id?: number
    created_at?: string
    message_created_at?: string
}

export function useNotifications(options?: { showToasts?: boolean }) {
    const queryClient = useQueryClient()
    const socketRef = useRef<WebSocket | null>(null)
    const showToasts = options?.showToasts ?? true

    // I-N2: staleTime + refetchOnWindowFocus desativado — WebSocket já invalida o cache
    const query = useQuery<Notification[]>({
        queryKey: ['notifications'],
        queryFn: async () => {
            try {
                const res = await api.get<Notification[]>('/api/notifications/notifications/')
                return res.data
            } catch (err) {
                console.error("[useNotifications] Fetch error:", err)
                return []
            }
        },
        initialData: [],
        staleTime: 30_000,           // I-N2: evita refetch desnecessário
        refetchOnWindowFocus: false, // I-N2: WebSocket já mantém o cache atualizado
    })

    const notifications = Array.isArray(query.data) ? query.data : []

    let unreadCount = 0
    try {
        if (Array.isArray(notifications)) {
            unreadCount = notifications.filter(n => n && !n.is_read).length
        }
    } catch (e) {
        console.error("[useNotificationsV2] Error calculating unreadCount:", e)
        unreadCount = 0
    }

    const setupWebSocket = useCallback(() => {
        if (WS_INITIALIZED && WS_SINGLETON) {
            socketRef.current = WS_SINGLETON
            return
        }

        const companySlug = localStorage.getItem('companySlug')
        const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG
        const effectiveCompany = companySlug || envCompany || undefined

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005'
        const isSecure = apiUrl.startsWith('https') || window.location.protocol === 'https:'
        const protocol = isSecure ? 'wss:' : 'ws:'
        const host = apiUrl.replace(/^https?:\/\//, '')

        const openSocket = async () => {
            // Bug N4: respeita limite de tentativas para não lopar infinitamente
            if (WS_RETRY_COUNT >= WS_MAX_RETRIES) {
                console.warn("[useNotifications] WebSocket max retries reached, giving up.")
                return
            }

            let token = localStorage.getItem("accessToken")
            if (!token) return
            if (isJwtExpired(token)) {
                try {
                    const fresh = await ensureFreshAccessToken()
                    if (fresh) token = fresh
                } catch {
                    return
                }
            }

            const qs = `token=${encodeURIComponent(token)}${effectiveCompany ? `&company_slug=${encodeURIComponent(effectiveCompany)}` : ''}`
            const wsUrl = `${protocol}//${host}/ws/notifications/?${qs}`
            const ws = new WebSocket(wsUrl)

            ws.onopen = () => {
                // Reconexão bem-sucedida: resetar contador
                WS_RETRY_COUNT = 0
            }

            ws.onmessage = (event) => {
                try {
                    const data: WSNotificationEvent = JSON.parse(event.data)
                    if (data.type === 'notification_message') {
                        queryClient.invalidateQueries({ queryKey: ['notifications'] })
                        queryClient.invalidateQueries({ queryKey: ['conversations'] })
                        if (showToasts) {
                            const ntype = data.notification_type || 'system'
                            if (ntype === 'message') {
                                const convId = data.conversation_id || data.conversation?.id
                                const key = typeof data.message_id === 'number'
                                    ? `msg:${data.message_id}`
                                    : `msg:${ntype}:${data.title}:${data.created_at}`
                                const now = Date.now()
                                const last = SHOWN_TOASTS.get(key)
                                // Limpeza de itens antigos
                                for (const [k, ts] of SHOWN_TOASTS.entries()) {
                                    if (now - ts > TOAST_TTL_MS) SHOWN_TOASTS.delete(k)
                                }
                                if (last && (now - last) < TOAST_TTL_MS) {
                                    return
                                }
                                SHOWN_TOASTS.set(key, now)

                                // Se a conversa aberta é a mesma, não notificar
                                try {
                                    const url = new URL(window.location.href)
                                    const isMessenger = url.pathname.startsWith('/messenger')
                                    const openConv = url.searchParams.get('conversation')
                                    const activeConvId = localStorage.getItem('activeConversationId')

                                    if (isMessenger && convId) {
                                        if ((openConv && String(convId) === openConv) ||
                                            (activeConvId && String(convId) === activeConvId)) {
                                            return
                                        }
                                    }
                                } catch { }

                                let muted: number[] = []
                                try {
                                    const raw = localStorage.getItem('mutedConversations')
                                    muted = raw ? JSON.parse(raw) : []
                                } catch { }
                                const isMuted = typeof convId === 'number' && Array.isArray(muted) && muted.includes(convId)
                                if (!isMuted) {
                                    const title = data.title || 'Nova mensagem'
                                    const description = data.message
                                    if (typeof convId === 'number') {
                                        toast(title, {
                                            description,
                                            action: {
                                                label: "Abrir conversa",
                                                onClick: () => {
                                                    try {
                                                        if (typeof data.message_id === 'number') {
                                                            localStorage.setItem('focusMessageId', String(data.message_id))
                                                        }
                                                        const createdAt = data.message_created_at || data.created_at
                                                        if (createdAt) {
                                                            localStorage.setItem('focusMessageCreatedAt', createdAt)
                                                        }
                                                    } catch { }
                                                    window.location.href = `/messenger?conversation=${convId}`
                                                }
                                            }
                                        })
                                    } else {
                                        notify.info(title, description)
                                    }
                                }
                            } else if (ntype === 'approval') {
                                notify.success(data.title || 'Nova aprovação', data.message)
                            } else {
                                notify.info(data.title || 'Notificação', data.message)
                            }
                        }
                    }
                } catch (err) {
                    console.error("[useNotifications] WebSocket message error:", err)
                }
            }

            ws.onclose = (event) => {
                WS_SINGLETON = null
                WS_INITIALIZED = false
                socketRef.current = null

                if (event.code === 4001 || event.code === 4003 || event.code === 4004) {
                    const t = localStorage.getItem("accessToken")
                    if (t && isJwtExpired(t)) {
                        openSocket()
                        return
                    }
                    console.warn(`[useNotifications] WebSocket closed with auth error (${event.code}), not retrying.`)
                    return
                }

                WS_RETRY_COUNT++
                // Bug N4: backoff exponencial com jitter
                const delay = Math.min(
                    WS_BASE_DELAY_MS * Math.pow(2, WS_RETRY_COUNT - 1),
                    60_000 // máximo 60s
                )
                const jitter = Math.random() * 1000
                if (WS_RETRY_COUNT < WS_MAX_RETRIES) {
                    setTimeout(openSocket, delay + jitter)
                }
            }

            ws.onerror = () => {
                // onclose será chamado logo depois — não precisamos agir aqui
            }

            socketRef.current = ws
            WS_SINGLETON = ws
            WS_INITIALIZED = true
        }

        openSocket()
    }, [queryClient, showToasts])

    useEffect(() => {
        setupWebSocket()
        return () => { }
    }, [setupWebSocket])

    const markAsRead = async (id: string) => {
        // MN2: optimistic update — marca como lida imediatamente no cache
        queryClient.setQueryData<Notification[]>(['notifications'], (old) =>
            old ? old.map(n => n.id === id ? { ...n, is_read: true } : n) : []
        )
        try {
            await api.post(`/api/notifications/notifications/${id}/mark_as_read/`)
        } catch (err) {
            console.error("[useNotifications] markAsRead error:", err)
            // Reverte o optimistic update em caso de erro
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }
    }

    const markAllAsRead = async () => {
        // MN2: optimistic update para markAllAsRead
        queryClient.setQueryData<Notification[]>(['notifications'], (old) =>
            old ? old.map(n => ({ ...n, is_read: true })) : []
        )
        try {
            await api.post('/api/notifications/notifications/mark_all_as_read/')
        } catch (err) {
            console.error("[useNotifications] markAllAsRead error:", err)
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }
    }

    return {
        notifications,
        unreadCount,
        isLoading: query.isLoading,
        markAsRead,
        markAllAsRead
    }
}
