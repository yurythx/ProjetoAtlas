"use client"

import { useNotifications, Notification } from "@/hooks/use-notifications-v2"
import { Button } from "@/components/ui/button"
import { Bell, MessageSquare, ShieldCheck, CheckCircle2, Calendar, ChevronRight, Search } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useDebounce } from "@/hooks/use-debounce"
import { Badge } from "@/components/ui/badge"

export default function NotificationsPage() {
    const { notifications, isLoading, markAsRead, markAllAsRead } = useNotifications({ showToasts: false })
    const router = useRouter()
    const [filter, setFilter] = useState<'all' | 'message' | 'system' | 'approval'>('all')
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebounce(search, 200)

    const formatDateTime = (value: string) => {
        const dt = new Date(value)
        if (Number.isNaN(dt.getTime())) return ""
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(dt)
    }

    const safeNotifications = Array.isArray(notifications) ? notifications : []
    const filteredNotifications = safeNotifications.filter(n => {
        if (!n) return false
        const matchesType = filter === 'all' || n.notification_type === filter
        const s = debouncedSearch.toLowerCase()
        const matchesSearch = (n.title || '').toLowerCase().includes(s) ||
            (n.message || '').toLowerCase().includes(s)
        return matchesType && matchesSearch
    })

    const openFromNotification = (n: Notification) => {
        try {
            if (n.notification_type === 'message') {
                let convId: string | null = null
                let messageId: string | null = null
                let createdAt: string | null = null
                if (n.link) {
                    const url = new URL(n.link, window.location.origin)
                    convId = url.searchParams.get('conversation')
                    messageId = url.searchParams.get('message_id') || url.searchParams.get('message') || url.searchParams.get('mid')
                    createdAt = url.searchParams.get('created_at') || url.searchParams.get('ts') || n.created_at
                }
                if (messageId) {
                    try {
                        localStorage.setItem('focusMessageId', String(messageId))
                    } catch {}
                }
                if (createdAt) {
                    try {
                        localStorage.setItem('focusMessageCreatedAt', createdAt)
                    } catch {}
                }
                if (convId) {
                    router.push(`/messenger?conversation=${convId}`)
                } else if (n.link) {
                    router.push(n.link)
                } else {
                    router.push(`/messenger`)
                }
                return
            }
            if (n.link) router.push(n.link)
        } catch {
            if (n.link) router.push(n.link)
        }
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'message': return <MessageSquare className="h-5 w-5 text-blue-500" />
            case 'approval': return <ShieldCheck className="h-5 w-5 text-amber-500" />
            default: return <Bell className="h-5 w-5 text-primary" />
        }
    }

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'message': return 'Mensagem'
            case 'approval': return 'Aprovação'
            default: return 'Sistema'
        }
    }

    return (
        <div className="max-w-5xl mx-auto py-8 space-y-8">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tight flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                                <Bell className="h-8 w-8 text-primary" />
                            </div>
                            Central de Notificações
                        </h1>
                        <p className="text-muted-foreground text-lg ml-1">Gerencie seus alertas e comunicações importantes.</p>
                    </div>

                    <Button
                        variant="outline"
                        onClick={markAllAsRead}
                        className="rounded-xl border-primary/20 hover:bg-primary/5 font-bold h-12"
                    >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Marcar todas como lidas
                    </Button>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <Input
                            placeholder="Pesquisar notificações..."
                            className="pl-11 h-12 rounded-xl bg-card/50 backdrop-blur-md border-border/50 focus-visible:ring-primary/20"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        {(['all', 'message', 'system', 'approval'] as const).map((t) => (
                            <Button
                                key={t}
                                variant={filter === t ? 'default' : 'ghost'}
                                onClick={() => setFilter(t)}
                                className={`rounded-xl h-12 px-6 font-bold transition-all ${filter === t ? 'shadow-lg shadow-primary/20' : 'hover:bg-primary/5'
                                    }`}
                            >
                                {t === 'all' ? 'Todas' : getTypeLabel(t)}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="animate-in fade-in duration-300">
                <div className="space-y-4">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-24 rounded-3xl bg-muted/20 animate-pulse border border-border/50" />
                        ))
                    ) : filteredNotifications.length > 0 ? (
                        filteredNotifications.map((n: Notification) => (
                            <div
                                key={n.id}
                                className={`group relative p-6 rounded-[2rem] border transition-all duration-300 ${n.is_read
                                    ? 'bg-card/30 border-border/30 opacity-70'
                                    : 'bg-card/80 border-primary/20 shadow-xl shadow-primary/5 active:scale-[0.98]'
                                    }`}
                                onClick={() => {
                                    markAsRead(n.id)
                                    openFromNotification(n)
                                }}
                            >
                                <div className="flex items-start gap-6">
                                    <div className={`h-14 w-14 rounded-2xl flex items-center justify-center border shadow-inner transition-transform group-hover:scale-110 ${n.is_read ? 'bg-muted/10 border-border/50' : 'bg-primary/10 border-primary/30'
                                        }`}>
                                        {getIcon(n.notification_type)}
                                    </div>

                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <h3 className={`font-black tracking-tight ${n.is_read ? 'text-foreground/70' : 'text-foreground'}`}>
                                                    {n.title}
                                                </h3>
                                                {typeof n.aggregate_count === "number" && n.aggregate_count > 1 && (
                                                    <Badge variant="secondary" className="text-[10px] h-6 px-2 rounded-xl">
                                                        {n.aggregate_count}
                                                    </Badge>
                                                )}
                                                {!n.is_read && (
                                                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tighter text-muted-foreground opacity-50">
                                                <Calendar className="h-3 w-3" />
                                                {formatDateTime(n.created_at)}
                                            </div>
                                        </div>
                                        {(() => {
                                            const count = typeof n.aggregate_count === "number" ? n.aggregate_count : 1
                                            const meta = (n.metadata || {}) as Record<string, unknown>
                                            const lastSnippet = typeof meta.last_snippet === "string" ? meta.last_snippet : null
                                            const raw = n.message || ""
                                            const main = count > 1 && raw.includes("Último:") ? raw.split("Último:")[0].trim() : raw
                                            return (
                                                <div className="space-y-1">
                                                    <p className={`text-sm leading-relaxed ${n.is_read ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                                                        {main}
                                                    </p>
                                                    {count > 1 && lastSnippet && (
                                                        <p className="text-xs text-muted-foreground/80 leading-relaxed">
                                                            Último: {lastSnippet}
                                                        </p>
                                                    )}
                                                </div>
                                            )
                                        })()}

                                        <div className="flex items-center gap-4 pt-2">
                                            {n.link && (
                                                <Button variant="link" className="p-0 h-auto text-xs font-bold text-primary hover:no-underline"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        markAsRead(n.id)
                                                        openFromNotification(n)
                                                    }}>
                                                    Acessar recurso <ChevronRight className="h-3 w-3" />
                                                </Button>
                                            )}
                                            {!n.is_read && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => markAsRead(n.id)}
                                                    className="h-auto p-0 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-transparent"
                                                >
                                                    Marcar como lida
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 rounded-[3rem] border border-dashed border-border/50 bg-muted/5">
                            <div className="p-6 rounded-full bg-muted/10">
                                <Bell className="h-12 w-12 text-muted-foreground/30" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-xl font-black text-foreground/50">Nenhuma notificação encontrada</h3>
                                <p className="text-muted-foreground/50">Você está em dia com todos os seus alertas!</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
