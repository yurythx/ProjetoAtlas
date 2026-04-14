import * as React from "react"
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { Send, Loader2, Paperclip, FileIcon, Download, X, ImageIcon, Check, CheckCheck, SmilePlus, Reply, ArrowLeft, MoreVertical, Trash2, Copy, Pencil, Bell, BellOff, Ban, Mail, Phone, Pin, Archive } from "lucide-react"
import { api } from "@/lib/axios"
import { Contact, User } from "@/types"
import { Conversation, Message, MessageReaction } from "@/types/messenger"
import {
  fetchAndUpsertConversation,
  removeConversation,
  updateArchivedCache,
  updateConversation,
  updateConversationsCache,
  updateDeletedCache,
  upsertConversation,
} from "./cache/conversations"
import { useChat } from "@/hooks/use-chat"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { usePresence } from "@/hooks/use-presence"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"


import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LinkPreview } from "./link-preview"


interface ChatWindowProps {
  contact: Contact;
  currentUser: User | null;
  onBack?: () => void;
  conversationId?: number | null;
}

export function ChatWindow({ contact, currentUser, onBack, conversationId }: ChatWindowProps) {
  // Force HMR refresh
  const [messageInput, setMessageInput] = React.useState("")
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const topRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [sendError, setSendError] = React.useState<string | null>(null)
  const lastPayloadRef = React.useRef<{
    content: string
    file?: File | null
    replyToId?: number | null
    clientId: string
    optimisticId: number
  } | null>(null)
  const retryCountRef = React.useRef<number>(0)
  const BASE_RETRY_DELAY_MS = 1000
  const [isDragging, setIsDragging] = React.useState(false)
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = React.useState<Message | null>(null)
  const [messageToDelete, setMessageToDelete] = React.useState<Message | null>(null)
  const [messageToInspect, setMessageToInspect] = React.useState<Message | null>(null)
  const [isConversationDeleteOpen, setIsConversationDeleteOpen] = React.useState(false)
  const [isConversationClearOpen, setIsConversationClearOpen] = React.useState(false)
  const [isConversationArchiveOpen, setIsConversationArchiveOpen] = React.useState(false)
  const [lightboxOpen, setLightboxOpen] = React.useState(false)
  const [lightboxIndex, setLightboxIndex] = React.useState(0)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [isMuted, setIsMuted] = React.useState(false)
  type ContactBlock = { id: number; blocked: number }
  const { data: blocks } = useQuery<ContactBlock[]>({
    queryKey: ["messenger-blocks"],
    queryFn: async () => {
      const res = await api.get<{ results: ContactBlock[] } | ContactBlock[]>("/api/messenger/blocks/")
      return Array.isArray(res.data) ? res.data : res.data?.results ?? []
    },
    staleTime: 30_000,
    enabled: !!currentUser,
  })
  const blockedEntry = React.useMemo(() => (blocks ?? []).find((b) => b.blocked === contact.id) ?? null, [blocks, contact.id])
  const isBlocked = !!blockedEntry
  const [isPinned, setIsPinned] = React.useState(false)
  const [seekingTarget, setSeekingTarget] = React.useState(false)
  const [highlightedMsgId, setHighlightedMsgId] = React.useState<number | null>(null)
  const { userStatuses } = usePresence()

  const DELETE_FOR_ALL_WINDOW_MS = (() => {
    const raw = process.env.NEXT_PUBLIC_MESSENGER_DELETE_FOR_ALL_WINDOW_SECONDS
    const parsed = raw ? Number(raw) : 600
    const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 600
    return seconds * 1000
  })()
  // Track which message IDs have already been marked as read to prevent duplicate API calls
  const markReadRef = React.useRef<Set<number>>(new Set())
  const { data: profile, isLoading: isLoadingProfile } = useQuery<User>({
    queryKey: ['user-profile', contact.id],
    queryFn: async () => {
      const res = await api.get<User>(`/api/accounts/users/${contact.id}/`)
      return res.data
    },
    enabled: !!contact.id && detailsOpen
  })

  const inputRef = React.useRef<HTMLInputElement>(null)
  const generateClientId = React.useCallback(() => {
    try {
      return crypto.randomUUID()
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }
  }, [])
  const profilePhone = React.useMemo(() => {
    if (!profile) return undefined
    const candidate = profile as unknown as { phone?: string; phone_number?: string }
    return candidate.phone || candidate.phone_number
  }, [profile])

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) return
      if (blockedEntry) {
        await api.delete(`/api/messenger/blocks/${blockedEntry.id}/`)
        return
      }
      await api.post("/api/messenger/blocks/", { blocked: contact.id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messenger-blocks"] })
      toast.success(isBlocked ? "Contato desbloqueado" : "Contato bloqueado")
    },
    onError: () => {
      toast.error("Erro ao atualizar bloqueio")
    },
  })

  const toggleBlock = () => {
    blockMutation.mutate()
  }

  // #2 Fix: toggleMute/togglePin now call backend REST API and fall back gracefully
  const toggleMute = async () => {
    if (!conversation?.id) return
    const next = !isMuted
    setIsMuted(next) // optimistic
    try {
      await api.post(`/api/messenger/conversations/${conversation.id}/${next ? 'mute' : 'unmute'}/`)
      updateConversationsCache(queryClient, (list) =>
        updateConversation(list, conversation.id, (c) => ({
          ...c,
          preference: { ...(c.preference ?? { is_muted: false, is_pinned: false }), is_muted: next },
        })),
      )
      toast.success(next ? "Conversa silenciada" : "Som ativado nesta conversa")
    } catch {
      setIsMuted(!next) // rollback
      toast.error("Erro ao atualizar preferência")
    }
  }

  const togglePin = async () => {
    if (!conversation?.id) return
    const next = !isPinned
    setIsPinned(next) // optimistic
    try {
      await api.post(`/api/messenger/conversations/${conversation.id}/${next ? 'pin' : 'unpin'}/`)
      updateConversationsCache(queryClient, (list) =>
        updateConversation(list, conversation.id, (c) => ({
          ...c,
          preference: { ...(c.preference ?? { is_muted: false, is_pinned: false }), is_pinned: next },
        })),
      )
      toast.success(next ? "Contato fixado" : "Contato desafixado")
    } catch {
      setIsPinned(!next) // rollback
      toast.error("Erro ao atualizar preferência")
    }
  }

  const deleteConversationForMe = async () => {
    if (!conversation?.id) return
    const convId = conversation.id
    try {
      await api.post(`/api/messenger/conversations/${convId}/delete_for_me/`)
      updateConversationsCache(queryClient, (list) => removeConversation(list, convId))
      updateDeletedCache(queryClient, (list) =>
        upsertConversation(list, {
          ...conversation,
          preference: {
            ...(conversation.preference ?? { is_muted: false, is_pinned: false }),
            is_deleted: true,
            deleted_at: new Date().toISOString(),
          },
        }),
      )
      queryClient.invalidateQueries({ queryKey: ['messages', convId] })
      toast.success("Conversa removida", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await api.post(`/api/messenger/conversations/${convId}/restore_for_me/`)
              updateDeletedCache(queryClient, (list) => removeConversation(list, convId))
              await fetchAndUpsertConversation(queryClient, convId)
              queryClient.invalidateQueries({ queryKey: ['messages', convId] })
              toast.success("Conversa restaurada")
            } catch {
              toast.error("Erro ao restaurar conversa")
            }
          },
        },
        duration: 6000,
      })
      setIsConversationDeleteOpen(false)
      onBack?.()
    } catch {
      toast.error("Erro ao remover conversa")
    }
  }

  const markAllRead = async () => {
    if (!conversation?.id) return
    try {
      await api.post(`/api/messenger/conversations/${conversation.id}/mark_all_read/`)
      updateConversationsCache(queryClient, (list) =>
        updateConversation(list, conversation.id, (c) => ({ ...c, unread_count: 0 })),
      )
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] })
      toast.success("Mensagens marcadas como lidas")
    } catch {
      toast.error("Erro ao marcar mensagens como lidas")
    }
  }

  const clearConversationForMe = async () => {
    if (!conversation?.id) return
    const convId = conversation.id
    try {
      const res = await api.post<{ cleared_at: string | null }>(`/api/messenger/conversations/${convId}/clear_for_me/`)
      updateConversationsCache(queryClient, (list) =>
        updateConversation(list, convId, (c) => ({
          ...c,
          last_message: null,
          unread_count: 0,
          preference: {
            ...(c.preference ?? { is_muted: false, is_pinned: false }),
            cleared_at: res.data?.cleared_at ?? new Date().toISOString(),
          },
        })),
      )
      queryClient.invalidateQueries({ queryKey: ['messages', convId] })
      toast.success("Conversa limpa", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await api.post(`/api/messenger/conversations/${convId}/unclear_for_me/`)
              updateConversationsCache(queryClient, (list) =>
                updateConversation(list, convId, (c) => ({
                  ...c,
                  preference: { ...(c.preference ?? { is_muted: false, is_pinned: false }), cleared_at: null },
                })),
              )
              await fetchAndUpsertConversation(queryClient, convId)
              queryClient.invalidateQueries({ queryKey: ['messages', convId] })
              toast.success("Histórico restaurado")
            } catch {
              toast.error("Erro ao restaurar histórico")
            }
          },
        },
        duration: 6000,
      })
      setIsConversationClearOpen(false)
    } catch {
      toast.error("Erro ao limpar conversa")
    }
  }

  const archiveConversationForMe = async () => {
    if (!conversation?.id) return
    const convId = conversation.id
    try {
      await api.post(`/api/messenger/conversations/${convId}/archive_for_me/`)
      updateConversationsCache(queryClient, (list) => removeConversation(list, convId))
      updateArchivedCache(queryClient, (list) =>
        upsertConversation(list, {
          ...conversation,
          preference: {
            ...(conversation.preference ?? { is_muted: false, is_pinned: false }),
            is_archived: true,
            archived_at: new Date().toISOString(),
          },
        }),
      )
      toast.success("Conversa arquivada", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await api.post(`/api/messenger/conversations/${convId}/unarchive_for_me/`)
              updateArchivedCache(queryClient, (list) => removeConversation(list, convId))
              await fetchAndUpsertConversation(queryClient, convId)
              toast.success("Conversa desarquivada")
            } catch {
              toast.error("Erro ao desarquivar conversa")
            }
          },
        },
        duration: 6000,
      })
      setIsConversationArchiveOpen(false)
      onBack?.()
    } catch {
      toast.error("Erro ao arquivar conversa")
    }
  }

  // 1. Load Conversation: prefer conversationId, else find/create by participant
  const { data: conversation, isLoading: isLoadingConv } = useQuery({
    queryKey: conversationId ? ['conversation-by-id', conversationId] : ['conversation', contact.id],
    queryFn: async () => {
      if (conversationId) {
        const res = await api.get<Conversation>(`/api/messenger/conversations/${conversationId}/`)
        return res.data
      }
      try {
        const findRes = await api.get<Conversation>(`/api/messenger/conversations/find_by_participant/?username=${contact.username}`)
        // Se retornar 204 (No Content), significa que não existe conversa. Lança erro para cair no catch e criar.
        if (findRes.status === 204 || !findRes.data) {
            throw new Error("Conversation not found")
        }
        return findRes.data
      } catch {
        const createRes = await api.post<Conversation>('/api/messenger/conversations/', {
          target_username: contact.username
        })
        return createRes.data
      }
    },
    enabled: conversationId ? true : !!contact.id
  })

  type MessageReceipts = {
    message_id: number
    conversation_id: number
    delivered: { user_id: number; username: string; delivered_at: string }[]
    read: { user_id: number; username: string; read_at: string }[]
    delivered_count: number
    read_count: number
    recipients: { user_id: number; username: string; delivered_at: string | null; read_at: string | null; is_delivered: boolean; is_read: boolean }[]
    pending_delivered: { user_id: number; username: string }[]
    pending_read: { user_id: number; username: string }[]
  }

  const { data: receipts, isLoading: isLoadingReceipts } = useQuery<MessageReceipts>({
    queryKey: ['message-receipts', messageToInspect?.id],
    queryFn: async () => {
      if (!messageToInspect?.id) throw new Error('No message')
      const res = await api.get<MessageReceipts>(`/api/messenger/messages/${messageToInspect.id}/receipts/`)
      return res.data
    },
    enabled: !!messageToInspect?.id,
  })

  // #2 Fix: Hydrate muted/pinned state from conversation.preference (API) not localStorage
  React.useEffect(() => {
    if (conversation?.preference) {
      setIsMuted(!!conversation.preference.is_muted)
      setIsPinned(!!conversation.preference.is_pinned)
    }
  }, [conversation?.id, conversation?.preference])

  // Track the active conversation so notifications can be suppressed without relying on URL params
  React.useEffect(() => {
    if (conversation?.id) {
      try {
        localStorage.setItem('activeConversationId', String(conversation.id))
      } catch { }
    }
    return () => {
      try {
        localStorage.removeItem('activeConversationId')
      } catch { }
    }
  }, [conversation?.id])

  // Reset the mark-read dedup set when switching conversations
  React.useEffect(() => {
    markReadRef.current = new Set()
  }, [contact.id])

  // 2. Fetch Messages with Infinite Query (Timestamp-based)
  const anchor = typeof window !== 'undefined' ? (localStorage.getItem('focusMessageCreatedAt') || null) : null
  const {
    data: infiniteMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['messages', conversation?.id],
    queryFn: async ({ pageParam }) => {
      if (!conversation?.id) return { results: [], next: null }

      let url = `/api/messenger/conversations/${conversation.id}/messages/`
      if (pageParam) {
        url = `${url}?before=${encodeURIComponent(pageParam as string)}`
      }

      const res = await api.get<{ results: Message[], next: string | null }>(url)
      return res.data
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.results || lastPage.results.length === 0) return undefined
      const oldest = lastPage.results[0]
      // Only continue if we received a full page (indicating there might be more)
      // or if backend explicitly tells us there is a next page
      return lastPage.next ? oldest.created_at : undefined
    },
    initialPageParam: (anchor as string | null),
    enabled: !!conversation?.id,
  })

  // 3. WebSocket Hook
  const expectedReaders = React.useMemo(() => {
    const count = Array.isArray(conversation?.participants) ? conversation!.participants.length : 0
    return Math.max(count - 1, 1)
  }, [conversation])

  const { typingUsers, handleTyping, sendTypingStatus, markRead, lastMessage } = useChat(
    conversation?.id ?? null,
    currentUser?.id ?? null,
    expectedReaders
  )

  // Sound effect
  const playNotificationSound = React.useCallback(() => {
    const audio = new Audio('/sounds/notification.mp3');
    audio.play().catch(e => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Audio play failed', e)
      }
    });
  }, []);

  React.useEffect(() => {
    const lm = lastMessage as { sender?: number } | null
    if (lm && typeof lm.sender === 'number' && lm.sender !== currentUser?.id && !isMuted) {
      playNotificationSound();
    }
    // Auto scroll on new message
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastMessage, currentUser?.id, playNotificationSound, isMuted]);






  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error("Arquivo muito grande: O limite é de 10MB.")
        return
      }
      setSelectedFile(file)
    }
  }

  // 2. Fetch Messages with Infinite Query - Moved to top


  // 3. WebSocket Hook
  // Moved to top-level to avoid conditional hook call if we had it inside
  // But we already called it above at line 64, so let's remove this duplicate declaration
  // and use the values from the first call.

  // 4. Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({
      content,
      file,
      replyToId,
      clientId,
    }: {
      content: string
      file?: File | null
      replyToId?: number | null
      clientId: string
    }) => {
      if (!conversation?.id) throw new Error("No conversation")

      const formData = new FormData()
      if (content) formData.append('content', content)
      if (file) formData.append('file', file)
      if (replyToId) formData.append('reply_to_id', replyToId.toString())
      formData.append('client_id', clientId)

      const res = await api.post<Message>(`/api/messenger/conversations/${conversation.id}/send_message/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return res.data
    },
    onSuccess: (serverMessage, variables) => {
      setMessageInput("")
      setSelectedFile(null)
      setReplyingTo(null)
      setSendError(null)
      retryCountRef.current = 0
      lastPayloadRef.current = null
      type MessagesPage = { results: Message[]; next: string | null }
      type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] }
      const withLocalStatus = (message: Message, local_status: Message["local_status"]): Message => ({
        ...message,
        local_status,
      })
      queryClient.setQueryData<MessagesData | undefined>(['messages', conversation?.id], (old) => {
        if (!old || !Array.isArray(old.pages)) return old
        const pages = old.pages.map((p) => ({
          ...p,
          results: Array.isArray(p.results) ? p.results.filter((m) => m.client_id !== variables.clientId) : p.results,
        }))
        const alreadyExists = pages.some((p) => Array.isArray(p.results) && p.results.some((m) => m.id === serverMessage.id))
        const pagesWithStatus = pages.map((p) => ({
          ...p,
          results: Array.isArray(p.results)
            ? p.results.map((m) => (m.id === serverMessage.id ? withLocalStatus(m, "sent") : m))
            : p.results,
        }))
        if (alreadyExists) return { pages: pagesWithStatus, pageParams: old.pageParams ?? [] }
        const first = pagesWithStatus[0]
        pagesWithStatus[0] = { ...first, results: [...first.results, withLocalStatus(serverMessage, "sent")] }
        return { pages: pagesWithStatus, pageParams: old.pageParams ?? [] }
      })
      if (conversation?.id) {
        updateConversationsCache(queryClient, (list) =>
          updateConversation(list, conversation.id, (c) => ({
            ...c,
            last_message: serverMessage,
            unread_count: 0,
            updated_at: serverMessage.created_at,
          })),
        )
      }
      // Clear focus anchors after sending a new message to ensure it's not excluded from refetch
      try {
        localStorage.removeItem('focusMessageId')
        localStorage.removeItem('focusMessageCreatedAt')
      } catch { }
    },
    onError: (_err, variables) => {
      type MessagesPage = { results: Message[]; next: string | null }
      type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] }
      const withLocalStatus = (message: Message, local_status: Message["local_status"]): Message => ({
        ...message,
        local_status,
      })
      queryClient.setQueryData<MessagesData | undefined>(['messages', conversation?.id], (old) => {
        if (!old || !Array.isArray(old.pages)) return old
        return {
          pages: old.pages.map((p) => ({
            ...p,
            results: Array.isArray(p.results)
              ? p.results.map((m) => (m.client_id === variables.clientId ? withLocalStatus(m, "failed") : m))
              : p.results,
          })),
          pageParams: old.pageParams ?? [],
        }
      })
      const attempts = retryCountRef.current
      if (attempts < 3 && lastPayloadRef.current) {
        const next = attempts + 1
        retryCountRef.current = next
        setSendError(`Erro ao enviar. Tentando novamente (${next}/3)...`)
        const delay = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, attempts), 5000)
        setTimeout(() => {
          if (lastPayloadRef.current) {
            sendMessageMutation.mutate(lastPayloadRef.current)
          }
        }, delay)
      } else {
        setSendError("Falha ao enviar mensagem. Verifique a conexão e tente novamente.")
        toast.error("Erro ao enviar: Não foi possível enviar sua mensagem.")
      }
    }
  })

  // Merge paginated history into a flat, chronologically-sorted list
  const messages = React.useMemo(() => {
    const history =
      infiniteMessages?.pages?.flatMap((page) => {
        const results = (page as { results?: Message[] }).results
        return Array.isArray(results) ? results : []
      }) || []
    const seen = new Set()
    return history.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [infiniteMessages])

  // Collect image slides for the Lightbox — must come after `messages` is declared
  const lightboxImages = React.useMemo(() => {
    return messages
      .filter((m: Message) => m.file_type?.startsWith('image/') && m.file_url)
      .map((m: Message) => ({ src: m.file_url!, alt: m.file_name ?? undefined }));
  }, [messages]);

  // Focus and highlight a specific message (for deep-linking via URL/search)
  // Placed AFTER `messages` declaration to avoid "used before declaration" lint errors
  React.useEffect(() => {
    const targetIdStr = typeof window !== 'undefined' ? localStorage.getItem('focusMessageId') : null
    const targetId = targetIdStr ? parseInt(targetIdStr) : null
    if (!targetId || !conversation?.id) return
    const exists = messages.some((m: Message) => m.id === targetId)
    if (!exists && hasNextPage && !isFetchingNextPage) {
      setSeekingTarget(true)
      fetchNextPage()
    } else if (!exists && !hasNextPage) {
      setSeekingTarget(false)
    } else if (exists) {
      setSeekingTarget(false)
      setTimeout(() => {
        const el = document.getElementById(`msg-${targetId}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('bg-primary/5', 'transition-colors', 'duration-1000')
          setTimeout(() => el.classList.remove('bg-primary/5'), 2000)
          setHighlightedMsgId(targetId)
          setTimeout(() => setHighlightedMsgId(null), 6000)
        }
        // Clear anchors immediately after locating the target
        try {
          localStorage.removeItem('focusMessageId')
          localStorage.removeItem('focusMessageCreatedAt')
        } catch { }
      }, 300)
    }
  }, [messages, conversation?.id, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Scroll to bottom when messages change (new message arrived via WS → cache updated)
  const prevMessageCountRef = React.useRef(0)
  React.useEffect(() => {
    if (seekingTarget) {
      prevMessageCountRef.current = messages.length
      return
    }
    if (messages.length > prevMessageCountRef.current && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
    prevMessageCountRef.current = messages.length
  }, [messages.length, seekingTarget])

  // Initial scroll to bottom
  React.useEffect(() => {
    if (scrollRef.current && messages.length > 0 && !isFetchingNextPage) {
      scrollRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [conversation?.id, isFetchingNextPage, messages.length])

  // Infinite Scroll Observer - DISABLED AUTO-FETCH
  // We are using the manual "Carregar mensagens anteriores" button for better UX stability
  // React.useEffect(() => {
  //   if (!hasNextPage || isFetchingNextPage) return;
  //   const observer = new IntersectionObserver(...)
  // }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!messageInput.trim() && !selectedFile) return
    if (isBlocked) {
      toast.error("Você bloqueou este contato.")
      return
    }

    if (!conversation?.id) {
      toast.error("Erro: Conversa não inicializada.");
      return;
    }

    sendTypingStatus(false)

    // Check if editing
    if (editingMessage) {
      editMessageMutation.mutate({ messageId: editingMessage.id, content: messageInput })
      return
    }

    const clientId = generateClientId()
    const optimisticId = -1 * Date.now()
    const optimisticMessage: Message = {
      id: optimisticId,
      client_id: clientId,
      conversation: conversation.id,
      sender: currentUser?.id ?? 0,
      sender_username: currentUser?.username ?? 'Você',
      content: messageInput || null,
      file: null,
      file_url: null,
      file_name: selectedFile?.name ?? null,
      file_type: selectedFile ? (selectedFile.type || 'application/octet-stream') : null,
      file_size: selectedFile?.size ?? null,
      created_at: new Date().toISOString(),
      is_read: false,
      edited_at: null,
      is_deleted: false,
      reactions: [],
      reply_to: replyingTo
        ? {
            id: replyingTo.id,
            content: replyingTo.content ?? null,
            sender: replyingTo.sender,
            sender_username: replyingTo.sender_username,
            created_at: replyingTo.created_at,
            file_name: replyingTo.file_name ?? null,
            file_type: replyingTo.file_type ?? null,
          }
        : null,
      local_status: 'sending',
    }

    type MessagesPage = { results: Message[]; next: string | null }
    type MessagesData = { pages: MessagesPage[]; pageParams?: unknown[] }
    queryClient.setQueryData<MessagesData | undefined>(['messages', conversation.id], (old) => {
      if (!old || !Array.isArray(old.pages) || old.pages.length === 0) {
        return { pages: [{ results: [optimisticMessage], next: null }], pageParams: [] }
      }
      const pages = old.pages.map((p) => ({
        ...p,
        results: Array.isArray(p.results) ? p.results.filter((m) => m.client_id !== clientId) : p.results,
      }))
      const first = pages[0]
      pages[0] = { ...first, results: [...(first.results ?? []), optimisticMessage] }
      return { pages, pageParams: old.pageParams ?? [] }
    })

    lastPayloadRef.current = { content: messageInput, file: selectedFile, replyToId: replyingTo?.id, clientId, optimisticId }
    retryCountRef.current = 0
    setSendError(null)
    sendMessageMutation.mutate(lastPayloadRef.current)
  }

  // Edit Message Mutation
  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: number, content: string }) => {
      await api.patch(`/api/messenger/messages/${messageId}/`, { content })
    },
    onSuccess: (_, { messageId, content }) => {
      setEditingMessage(null)
      setMessageInput("")
      toast.success("Mensagem editada")
      // #11 fix: update cache immediately without waiting for WS
      queryClient.setQueryData<{ pages: { results: Message[] }[] }>(
        ['messages', conversation?.id],
        (old) => {
          if (!old) return old
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              results: page.results.map((m) =>
                m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
              )
            }))
          }
        }
      )
    },
    onError: () => {
      toast.error("Erro ao editar mensagem")
    }
  })

  const handleEdit = (msg: Message) => {
    setEditingMessage(msg)
    setMessageInput(msg.content ?? '') // #7 fix: content may be null for deleted messages
    inputRef.current?.focus()
  }

  const cancelEdit = () => {
    setEditingMessage(null)
    setMessageInput("")
  }

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput(prev => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value)
    handleTyping()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error("Arquivo muito grande: O limite é de 10MB.")
        return
      }
      setSelectedFile(file)
    }
  }

  const handleReaction = async (messageId: number, emoji: string, currentReactions: MessageReaction[]) => {
    const hasReacted = currentReactions?.some(r => r.user === currentUser?.id && r.emoji === emoji);
    const action = hasReacted ? 'remove' : 'add';

    try {
      await api.post(`/api/messenger/messages/${messageId}/reaction/`, { emoji, action });
    } catch {
      toast.error("Falha ao reagir")
    }
  }

  const handleReply = (msg: Message) => {
    setReplyingTo(msg)
    inputRef.current?.focus()
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copiado para a área de transferência")
  }

  const handleDelete = async (messageId: number) => {
    try {
      await api.delete(`/api/messenger/messages/${messageId}/`)
      // Optimistic update handled by WebSocket listener in useChat
      toast.success("Mensagem excluída para todos")
    } catch {
      toast.error("Erro ao excluir mensagem. A janela pode ter expirado.")
    }
  }

  if (isLoadingConv) {
    return (
      <div className="flex flex-col h-full bg-background/30 backdrop-blur-sm">
        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-background/50">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={cn("flex gap-3 max-w-[80%]", i % 2 === 0 ? "ml-auto flex-row-reverse" : "")}>
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-2">
                <Skeleton className={cn("h-12 w-64 rounded-2xl", i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none")} />
                <Skeleton className="h-3 w-12 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col h-full bg-background relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center border-2 border-dashed border-primary m-4 rounded-xl animate-in fade-in duration-200">
          <div className="flex flex-col items-center gap-4 text-primary">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center animate-bounce">
              <Download className="h-10 w-10" />
            </div>
            <p className="text-xl font-bold">Solte o arquivo para enviar</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="h-16 border-b flex items-center px-4 justify-between bg-background/50 backdrop-blur-md shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden -ml-2 h-8 w-8"
              onClick={onBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Button
            type="button"
            variant={isPinned ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={togglePin}
            aria-label={isPinned ? "Desafixar contato" : "Fixar contato"}
            title={isPinned ? "Desafixar" : "Fixar"}
          >
            <Pin className="h-4 w-4" />
          </Button>
          {isMuted && (
            <Badge variant="outline" className="text-[10px] px-2">Silenciada</Badge>
          )}
          <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
            <SheetTrigger asChild>
              <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30" aria-label="Abrir detalhes do contato">
                <Avatar className="h-10 w-10 border border-border/50 shadow-sm">
                  <AvatarImage src={contact.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {(contact.username || contact.email || '??').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Detalhes do contato</SheetTitle>
                <SheetDescription>Informações do perfil e status</SheetDescription>
              </SheetHeader>
              <div className="p-4 space-y-6">
                {isLoadingProfile && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-16 w-16 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-56" />
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border border-border/50 shadow-sm">
                    <AvatarImage src={contact.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {(contact.username || contact.email || '??').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-bold text-base">
                      {([profile?.first_name, profile?.last_name].filter(Boolean).join(' ')) || contact.username || contact.email}
                    </span>
                    {profile?.email ? (
                      <span className="text-sm text-muted-foreground">{profile.email}</span>
                    ) : contact.email ? (
                      <span className="text-sm text-muted-foreground">{contact.email}</span>
                    ) : null}
                  {(() => {
                    const status = (contact.id > 0 ? userStatuses.get(contact.id) : undefined) ?? contact.status ?? (contact.is_online ? 'online' : 'offline')
                    if (status === 'online' || status === 'busy') {
                      const isBusy = status === 'busy'
                      return (
                        <span className={cn(
                          "text-xs font-medium mt-1 flex items-center gap-1",
                          isBusy ? "text-yellow-600" : "text-green-600"
                        )}>
                          <span className={cn(
                            "h-2 w-2 rounded-full",
                            isBusy ? "bg-yellow-600" : "bg-green-600"
                          )} />
                          {isBusy ? 'Ocupado' : 'Online'}
                        </span>
                      )
                    }
                    return (
                      <span className="text-xs text-muted-foreground mt-1">
                        {contact.last_seen ? `Visto por último: ${new Date(contact.last_seen).toLocaleString()}` : 'Offline'}
                      </span>
                    )
                  })()}
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Usuário</span>
                    <span className="text-sm">
                      {profile?.username || contact.username}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Nome completo</span>
                    <span className="text-sm">
                      {([profile?.first_name, profile?.last_name].filter(Boolean).join(' ')) || contact.username}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Email</span>
                    <span className="text-sm">
                      {profile?.email || contact.email || 'Não informado'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Telefone</span>
                    <span className="text-sm">
                      {(() => {
                        const p = profile as User & { phone?: string; phone_number?: string }
                        return p?.phone || p?.phone_number || 'Não informado'
                      })()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Empresa</span>
                    <span className="text-sm">
                      {typeof profile?.company === 'object' && profile?.company && 'name' in profile.company
                        ? (profile.company as { name: string }).name
                        : null}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Papel</span>
                    <span className="text-sm">
                      {profile?.role_details?.name || (contact.is_staff ? 'Staff' : 'Membro')}
                    </span>
                  </div>
                </div>
                <div className="pt-2 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Ações rápidas</span>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="rounded-xl" onClick={toggleMute}>
                        {isMuted ? <BellOff className="h-4 w-4 mr-2" /> : <Bell className="h-4 w-4 mr-2" />}
                        {isMuted ? "Ativar som" : "Silenciar conversa"}
                      </Button>
                      <Button variant="outline" className="rounded-xl" onClick={toggleBlock}>
                        <Ban className="h-4 w-4 mr-2" />
                        {isBlocked ? "Desbloquear contato" : "Bloquear contato"}
                      </Button>
                      {profile?.email && (
                        <Button variant="ghost" className="rounded-xl" onClick={() => handleCopy(profile.email!)}>
                          <Mail className="h-4 w-4 mr-2" />
                          Copiar e-mail
                        </Button>
                      )}
                      {profilePhone && (
                        <Button variant="ghost" className="rounded-xl" onClick={() => {
                          handleCopy(profilePhone)
                        }}>
                          <Phone className="h-4 w-4 mr-2" />
                          Copiar telefone
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Grupos</span>
                  <div className="flex flex-wrap gap-2">
                    {(contact.group_names || []).length > 0 ? (
                      contact.group_names.map((g) => (
                        <Badge key={g} variant="secondary">{g}</Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem grupos</span>
                    )}
                  </div>
                </div>
                {contact.is_staff && <Badge variant="outline">Equipe</Badge>}
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex flex-col">
            <h3 className="font-semibold text-sm leading-none">
              {([profile?.first_name, profile?.last_name].filter(Boolean).join(' ')) || contact.username || contact.email || 'Contato'}
            </h3>
            {/* #13 fix: show correct status label for online/busy/offline */}
            {(() => {
              if (contact.id > 0 && typingUsers[contact.id]) {
                return (
                  <span className="text-[10px] font-medium mt-1 text-primary">
                    digitando...
                  </span>
                )
              }

              const presenceStatus =
                (contact.id > 0 ? userStatuses.get(contact.id) : undefined) ??
                contact.status ??
                (contact.is_online ? 'online' : 'offline')

              if (presenceStatus === 'online' || presenceStatus === 'busy') {
                const isBusy = presenceStatus === 'busy'
                return (
                  <span className={cn(
                    "text-[10px] font-medium mt-1 flex items-center gap-1",
                    isBusy ? "text-yellow-500" : "text-green-500"
                  )}>
                    <span className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isBusy ? "bg-yellow-500" : "bg-green-500 animate-pulse"
                    )} />
                    {isBusy ? 'Ocupado' : 'Online'}
                  </span>
                )
              }

              return (
                <span className="text-[10px] text-muted-foreground mt-1">
                  {contact.last_seen ? `Visto por último: ${new Date(contact.last_seen).toLocaleString()}` : 'Offline'}
                </span>
              )
            })()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Menu da conversa">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailsOpen(true)}>
                Ver detalhes do contato
              </DropdownMenuItem>
              <DropdownMenuItem onClick={markAllRead}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Marcar todas como lidas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleMute}>
                {isMuted ? <><Bell className="mr-2 h-4 w-4" /> Ativar som</> : <><BellOff className="mr-2 h-4 w-4" /> Silenciar conversa</>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={togglePin}>
                <Pin className="mr-2 h-4 w-4" />
                {isPinned ? "Desafixar contato" : "Fixar contato"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsConversationArchiveOpen(true)}>
                <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                Arquivar conversa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsConversationClearOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Limpar conversa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsConversationDeleteOpen(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Excluir conversa
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleBlock} className="text-destructive focus:text-destructive">
                <Ban className="mr-2 h-4 w-4" />
                {isBlocked ? "Desbloquear contato" : "Bloquear contato"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 overflow-x-hidden">
        <div className="space-y-6 max-w-4xl mx-auto pb-4">

          {(seekingTarget || isFetchingNextPage) && (
            <div className="flex justify-center py-2">
              <span className="text-xs text-muted-foreground inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Carregando mensagens anteriores para localizar a mensagem…
              </span>
            </div>
          )}

          {hasNextPage && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-xs text-muted-foreground"
              >
                {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                Carregar mensagens anteriores
              </Button>
            </div>
          )}

          {/* Invisible anchor for scrolling to top when fetching previous messages */}
          <div ref={topRef} className="h-1" />

          {messages.map((msg, index) => {
            const isMe = msg.sender === currentUser?.id
            const isImage = msg.file_type?.startsWith('image/')
            const showAvatar = !isMe && (index === 0 || messages[index - 1].sender !== msg.sender)

            // Date Separator Logic
            const showDateSeparator = index === 0 ||
              new Date(msg.created_at).toDateString() !== new Date(messages[index - 1].created_at).toDateString();

            const dateLabel = (() => {
              const date = new Date(msg.created_at);
              const today = new Date();
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);

              if (date.toDateString() === today.toDateString()) return "Hoje";
              if (date.toDateString() === yesterday.toDateString()) return "Ontem";
              return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
            })();

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="flex justify-center my-4 sticky top-2 z-10">
                    <span className="text-[10px] font-bold text-muted-foreground/80 bg-background/80 backdrop-blur-md px-3 py-1 rounded-full border shadow-sm">
                      {dateLabel}
                    </span>
                  </div>
                )}
                <div
                  key={msg.id}
                  ref={(el) => {
                    if (el && !msg.is_read && msg.sender !== currentUser?.id) {
                      // Guard: only mark each message once per session
                      if (markReadRef.current.has(msg.id)) return
                      const observer = new IntersectionObserver(
                        (entries) => {
                          if (entries[0].isIntersecting) {
                            // Double-check the ref before calling (React StrictMode can fire twice)
                            if (!markReadRef.current.has(msg.id)) {
                              markReadRef.current.add(msg.id)
                              const sent = markRead([msg.id])
                              if (!sent) {
                                api.post(`/api/messenger/messages/${msg.id}/mark_read/`).catch(() => { })
                              }
                              msg.is_read = true
                              msg.is_delivered = true
                            }
                            observer.disconnect()
                          }
                        },
                        { threshold: 0.5 }
                      )
                      observer.observe(el)
                    }
                  }}
                  className={cn(
                    "flex gap-3 w-full group",
                    isMe ? "justify-end" : "justify-start"
                  )}
                >
                  {!isMe && (
                    <div className="w-8 flex-shrink-0 flex flex-col justify-end">
                      {showAvatar ? (
                        <Avatar className="h-8 w-8 border border-border/50 shadow-sm cursor-pointer" onClick={() => setDetailsOpen(true)}>
                          <AvatarImage src={contact.avatar_url || undefined} />
                          <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-bold">
                            {(contact.username || contact.email || '??').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ) : <div className="w-8" />}
                    </div>
                  )}

                  {/* Reply Action (Left for Me) */}
                  {isMe && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                        onClick={() => handleReply(msg)}
                      >
                        <Reply className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className={cn("flex flex-col gap-1 max-w-[75%]", isMe ? "items-end" : "items-start")}>

                    <div
                      id={`msg-${msg.id}`}
                      className={cn(
                        "relative flex flex-col gap-2 rounded-2xl px-4 py-2.5 text-sm shadow-sm transition-all",
                        isMe
                          ? "bg-primary text-primary-foreground rounded-br-none shadow-primary/20"
                          : "bg-card border border-border/50 text-foreground rounded-bl-none shadow-sm"
                      )}
                    >
                      {highlightedMsgId === msg.id && (
                        <Badge className="absolute -top-2 -right-2 h-5 px-2 text-[10px] rounded-full">
                          Nova
                        </Badge>
                      )}
                      {/* Reply Context (Inside Bubble) */}
                      {msg.reply_to && (
                        <div
                          className={cn(
                            "mb-2 text-xs px-3 py-2 rounded-lg border-l-4 cursor-pointer opacity-90 transition-opacity hover:opacity-100",
                            isMe
                              ? "bg-black/10 border-l-primary-foreground/70 text-primary-foreground/90"
                              : "bg-muted border-l-primary/70 text-muted-foreground"
                          )}
                          onClick={() => {
                            const el = document.getElementById(`msg-${msg.reply_to?.id}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.classList.add('bg-primary/5', 'transition-colors', 'duration-1000');
                              setTimeout(() => el.classList.remove('bg-primary/5'), 2000);
                            } else {
                              toast.info("Mensagem original não está visível no histórico carregado.");
                            }
                          }}
                        >
                          <p className="font-bold mb-0.5 text-[10px] opacity-80">
                            {msg.reply_to.sender === currentUser?.id ? 'Você' : msg.reply_to.sender_username}
                          </p>
                          <p className="truncate line-clamp-1">
                            {msg.reply_to.content || (msg.reply_to.file_name ? 'Anexo' : 'Mensagem')}
                          </p>
                        </div>
                      )}

                      {/* Image Attachment */}
                      {isImage && msg.file_url && (() => {
                        const imgIdx = lightboxImages.findIndex(i => i.src === msg.file_url)
                        return (
                          <div
                            className="mb-2 overflow-hidden rounded-xl border border-border/20 bg-black/5 relative h-[240px] cursor-pointer"
                            onClick={() => {
                              setLightboxIndex(imgIdx >= 0 ? imgIdx : 0)
                              setLightboxOpen(true)
                            }}
                            title="Clique para ampliar"
                          >
                            <Image
                              src={msg.file_url}
                              alt={msg.file_name || 'Imagem'}
                              fill
                              className="object-contain transition-transform hover:scale-[1.02]"
                              sizes="(max-width: 768px) 100vw, 50vw"
                            />
                          </div>
                        )
                      })()}

                      {/* Other File Attachment */}
                      {!isImage && msg.file_url && (
                        <div className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border mb-1",
                          isMe ? "bg-primary-foreground/10 border-primary-foreground/20" : "bg-muted/50 border-border/50"
                        )}>
                          <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm", isMe ? "bg-primary-foreground/20" : "bg-background")}>
                            <FileIcon className={cn("h-5 w-5", isMe ? "text-primary-foreground" : "text-primary")} />
                          </div>
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="font-bold truncate text-xs">{msg.file_name}</p>
                            <p className="text-[10px] opacity-70 font-mono">
                              {(msg.file_size || 0) > 1024 * 1024
                                ? `${((msg.file_size || 0) / (1024 * 1024)).toFixed(1)} MB`
                                : `${((msg.file_size || 0) / 1024).toFixed(0)} KB`}
                            </p>
                          </div>
                          <a
                            href={msg.file_url}
                            download={msg.file_name}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "p-2 rounded-full transition-colors",
                              isMe ? "hover:bg-primary-foreground/20 text-primary-foreground" : "hover:bg-muted text-foreground"
                            )}
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </div>
                      )}

                      {/* #16 fix: show 'Mensagem excluída' for soft-deleted messages */}
                      {msg.is_deleted ? (
                        <span className="italic text-xs opacity-60 flex items-center gap-1">
                          <Trash2 className="h-3 w-3" />
                          Mensagem excluída
                        </span>
                      ) : msg.content ? (
                        <div className="space-y-2">
                          <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                          {(() => {
                            // Simple URL detection regex
                            const urlRegex = /(https?:\/\/[^\s]+)/g;
                            const urls = msg.content.match(urlRegex);
                            if (urls && urls.length > 0) {
                              // We only show preview for the first link to avoid clutter
                              return <LinkPreview url={urls[0]} className={isMe ? "bg-black/20" : ""} />;
                            }
                            return null;
                          })()}
                        </div>
                      ) : null}


                      <div className="flex items-center justify-between gap-4 mt-0.5 min-w-[60px]">
                        <span className={cn(
                          "text-[10px] font-medium opacity-60 tabular-nums",
                          isMe ? "text-primary-foreground" : "text-muted-foreground"
                        )}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        <div className="flex items-center gap-1">
                          {/* Message Actions Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 data-[state=open]:opacity-100",
                                  isMe ? "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:text-foreground"
                                )}
                                aria-label="Abrir menu da mensagem"
                              >
                                <MoreVertical className="h-3 w-3" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={isMe ? "end" : "start"}>
                              <DropdownMenuItem onClick={() => handleReply(msg)}>
                                <Reply className="mr-2 h-4 w-4" aria-hidden="true" />
                                Responder
                              </DropdownMenuItem>
                              {msg.content && (
                                <DropdownMenuItem onClick={() => handleCopy(msg.content!)}>
                                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                                  Copiar
                                </DropdownMenuItem>
                              )}
                              {isMe && msg.id > 0 && (
                                <DropdownMenuItem onClick={() => setMessageToInspect(msg)}>
                                  <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                                  Informações
                                </DropdownMenuItem>
                              )}
                              {isMe && msg.content && (
                                <DropdownMenuItem onClick={() => handleEdit(msg)}>
                                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                                  Editar
                                </DropdownMenuItem>
                              )}
                              {isMe && msg.id > 0 && !msg.is_deleted && (Date.now() - new Date(msg.created_at).getTime()) <= DELETE_FOR_ALL_WINDOW_MS && (
                                <DropdownMenuItem onClick={() => setMessageToDelete(msg)} className="text-destructive focus:text-destructive">
                                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                  Excluir para todos
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {isMe && (
                            <div
                              className={cn(
                                "flex items-center -mr-1 scale-90",
                                msg.id > 0 && msg.local_status !== 'sending' && msg.local_status !== 'failed' && "cursor-pointer"
                              )}
                              role={msg.id > 0 && msg.local_status !== 'sending' && msg.local_status !== 'failed' ? "button" : undefined}
                              tabIndex={msg.id > 0 && msg.local_status !== 'sending' && msg.local_status !== 'failed' ? 0 : undefined}
                              onClick={() => {
                                if (msg.id > 0 && msg.local_status !== 'sending' && msg.local_status !== 'failed') setMessageToInspect(msg)
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter' && e.key !== ' ') return
                                if (msg.id > 0 && msg.local_status !== 'sending' && msg.local_status !== 'failed') setMessageToInspect(msg)
                              }}
                              title={(() => {
                                if (msg.local_status === 'sending') return 'Enviando...'
                                if (msg.local_status === 'failed') return 'Falha ao enviar'
                                const expected = expectedReaders
                                const deliveredCount = typeof msg.delivered_by_count === 'number' ? msg.delivered_by_count : 0
                                const readCount = typeof msg.read_by_count === 'number' ? msg.read_by_count : 0
                                return `Entregue: ${deliveredCount}/${expected} • Lida: ${readCount}/${expected}`
                              })()}
                            >
                              {msg.local_status === 'sending' ? (
                                <Loader2 className="h-3 w-3 animate-spin text-primary-foreground/60" />
                              ) : msg.local_status === 'failed' ? (
                                <X className="h-3 w-3 text-destructive-foreground/90" />
                              ) : msg.is_read ? (
                                <CheckCheck className="h-3 w-3 text-sky-200" strokeWidth={2.5} />
                              ) : msg.is_delivered ? (
                                <CheckCheck className="h-3 w-3 text-primary-foreground/70" strokeWidth={2.5} />
                              ) : (
                                <Check className="h-3 w-3 text-primary-foreground/50" />
                              )}
                              {expectedReaders > 1 && msg.local_status !== 'sending' && msg.local_status !== 'failed' && (
                                <span className="ml-1 text-[10px] text-primary-foreground/70 tabular-nums">
                                  {(typeof msg.read_by_count === 'number' ? msg.read_by_count : (typeof msg.delivered_by_count === 'number' ? msg.delivered_by_count : 0))}/{expectedReaders}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className={cn("flex gap-1 flex-wrap -mt-2 z-10 px-2", isMe ? "justify-end" : "justify-start")}>
                        {Object.entries((msg.reactions || []).reduce((acc, r) => {
                          acc[r.emoji] = (acc[r.emoji] || []).concat(r);
                          return acc;
                        }, {} as Record<string, MessageReaction[]>)).map(([emoji, reactions]) => {
                          const isReactedByMe = reactions.some(r => r.user === currentUser?.id);
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.id, emoji, msg.reactions || [])}
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-full border shadow-sm flex items-center gap-1 transition-all hover:scale-110",
                                isReactedByMe ? "bg-primary/10 border-primary/20 text-primary" : "bg-background border-border hover:bg-muted"
                              )}
                            >
                              <span>{emoji}</span>
                              <span className="font-bold">{reactions.length}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Reply Action (Right for Others) */}
                  {!isMe && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-muted text-muted-foreground"
                        onClick={() => handleReply(msg)}
                        aria-label="Responder mensagem"
                      >
                        <Reply className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </div>
              </React.Fragment>
            )
          })}

          {/* Typing indicator */}
          {Object.entries(typingUsers).length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse ml-1">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.3s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.15s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce"></span>
              </div>
              <span>
                {Object.values(typingUsers).join(", ")} {Object.values(typingUsers).length === 1 ? "está digitando..." : "estão digitando..."}
              </span>
            </div>
          )}

          <div ref={scrollRef} className="h-1" />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t bg-card shrink-0">
        <div className="max-w-4xl mx-auto space-y-4">

          {/* Editing Preview */}
          {editingMessage && (
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl border border-l-4 border-l-primary animate-in slide-in-from-bottom-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary mb-0.5">
                  Editando mensagem
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {editingMessage.content}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-background/80"
                onClick={cancelEdit}
                aria-label="Cancelar edição"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* Reply Preview */}
          {replyingTo && !editingMessage && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl border border-l-4 border-l-primary animate-in slide-in-from-bottom-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-primary mb-0.5">
                  Respondendo a {replyingTo.sender === currentUser?.id ? 'Você' : replyingTo.sender_username || 'Usuário'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {replyingTo.content || (replyingTo.file_url ? 'Anexo de arquivo' : 'Mensagem')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-background/80"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancelar resposta"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* File Preview */}
          {selectedFile && (
            <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-2xl border border-primary/20 animate-in slide-in-from-bottom-2 shadow-sm">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                {selectedFile.type.startsWith('image/') ? (
                  <ImageIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                ) : (
                  <Paperclip className="h-5 w-5 text-primary" aria-hidden="true" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Pronto para enviar
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => setSelectedFile(null)}
                aria-label="Remover arquivo"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}

          {sendError && (
            <div className="w-full text-sm text-destructive font-medium bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
              {sendError}
            </div>
          )}

          {isBlocked && (
            <div className="w-full flex items-center justify-between gap-3 text-sm bg-muted border rounded-xl p-3">
              <div className="text-muted-foreground">
                Você bloqueou este contato. Desbloqueie para enviar mensagens.
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={toggleBlock}
                disabled={blockMutation.isPending}
              >
                Desbloquear
              </Button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex gap-2 items-end">
            <div className="flex-1 relative bg-muted rounded-xl border focus-within:ring-2 focus-within:ring-primary/20 transition-all">
              <Input
                ref={inputRef}
                value={messageInput}
                onChange={handleInputChange}
                aria-label="Campo de mensagem"
                disabled={isBlocked}

                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (messageInput.trim() || selectedFile) {
                      handleSend()
                    }
                  }
                }}
                placeholder={editingMessage ? "Editar mensagem..." : "Escreva uma mensagem..."}
                className="border-none bg-transparent focus-visible:ring-0 min-h-[44px] py-2.5 pl-3 pr-20"
                autoFocus
              />
              <div className="absolute right-2 bottom-1.5 flex gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      disabled={isBlocked}
                    >
                      <SmilePlus className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border-none bg-transparent shadow-none" side="top" align="end">
                    <EmojiPicker onEmojiClick={handleEmojiClick} lazyLoadEmojis={true} theme={Theme.AUTO} />
                  </PopoverContent>
                </Popover>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!!editingMessage || isBlocked}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {editingMessage ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 rounded-xl"
                  onClick={cancelEdit}
                >
                  <X className="h-5 w-5" />
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  className="h-11 w-11 rounded-xl shadow-lg shadow-primary/20 shrink-0"
                  disabled={editMessageMutation.isPending || !messageInput.trim()}
                >
                  {editMessageMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" />
                  )}
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="h-11 w-11 rounded-xl shadow-lg shadow-primary/20 shrink-0"
                disabled={sendMessageMutation.isPending || isBlocked || (!messageInput.trim() && !selectedFile)}
                aria-label="Enviar mensagem"
              >

                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            )}
          </form>
        </div>
      </div>
      <AlertDialog open={!!messageToDelete} onOpenChange={(open) => { if (!open) setMessageToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir para todos</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A mensagem será removida para todos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!messageToDelete) return
                handleDelete(messageToDelete.id)
                setMessageToDelete(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isConversationDeleteOpen} onOpenChange={setIsConversationDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Isto remove a conversa apenas para você. As outras pessoas continuam vendo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={deleteConversationForMe}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isConversationClearOpen} onOpenChange={setIsConversationClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o histórico desta conversa apenas para você.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearConversationForMe}>
              Limpar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isConversationArchiveOpen} onOpenChange={setIsConversationArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar conversa</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa será movida para Arquivadas e removida da lista principal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={archiveConversationForMe}>
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!messageToInspect} onOpenChange={(open) => { if (!open) setMessageToInspect(null) }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-md max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr]">
          <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle>Informações da mensagem</DialogTitle>
            <DialogDescription>
              {messageToInspect?.content
                ? messageToInspect.content
                : messageToInspect?.file_name
                  ? messageToInspect.file_name
                  : 'Mensagem'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
            {isLoadingReceipts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="text-sm font-semibold">Entregue ({receipts?.delivered_count ?? 0})</div>
                  <ScrollArea className="h-36 rounded-md border p-2">
                    <div className="grid gap-2">
                      {receipts?.delivered?.length ? receipts.delivered.map((d) => (
                        <div key={`${d.user_id}:${d.delivered_at}`} className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{d.username}</span>
                          <span className="text-muted-foreground">
                            {new Date(d.delivered_at).toLocaleString()}
                          </span>
                        </div>
                      )) : (
                        <div className="text-sm text-muted-foreground">Ainda não entregue.</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-semibold">Não entregue ({receipts?.pending_delivered?.length ?? 0})</div>
                  <ScrollArea className="h-28 rounded-md border p-2">
                    <div className="grid gap-2">
                      {receipts?.pending_delivered?.length ? receipts.pending_delivered.map((u) => (
                        <div key={u.user_id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{u.username}</span>
                        </div>
                      )) : (
                        <div className="text-sm text-muted-foreground">Entregue para todos.</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-semibold">Lido ({receipts?.read_count ?? 0})</div>
                  <ScrollArea className="h-36 rounded-md border p-2">
                    <div className="grid gap-2">
                      {receipts?.read?.length ? receipts.read.map((r) => (
                        <div key={`${r.user_id}:${r.read_at}`} className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{r.username}</span>
                          <span className="text-muted-foreground">
                            {new Date(r.read_at).toLocaleString()}
                          </span>
                        </div>
                      )) : (
                        <div className="text-sm text-muted-foreground">Ainda não lida.</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-semibold">Não lida ({receipts?.pending_read?.length ?? 0})</div>
                  <ScrollArea className="h-28 rounded-md border p-2">
                    <div className="grid gap-2">
                      {receipts?.pending_read?.length ? receipts.pending_read.map((u) => (
                        <div key={u.user_id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{u.username}</span>
                        </div>
                      )) : (
                        <div className="text-sm text-muted-foreground">Lida por todos.</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={lightboxImages}
      />
    </div>
  )
}
