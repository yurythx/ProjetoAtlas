"use client"

import { Bell, Check, MessageSquare, Info, ExternalLink, ChevronRight } from "lucide-react"
import { useNotifications, Notification } from "@/hooks/use-notifications-v2"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useRouter } from "next/navigation"

export function NotificationBell() {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
    const router = useRouter()

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
                    createdAt = url.searchParams.get('created_at') || url.searchParams.get('ts')
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
            // Outros tipos: abrir link se houver
            if (n.link) {
                router.push(n.link)
            }
        } catch {
            if (n.link) router.push(n.link)
        }
    }

    const getIcon = (type: Notification['notification_type']) => {
        switch (type) {
            case 'message': return <MessageSquare className="h-4 w-4 text-blue-500" aria-hidden="true" />
            case 'approval': return <Check className="h-4 w-4 text-green-500" aria-hidden="true" />
            default: return <Info className="h-4 w-4 text-primary" aria-hidden="true" />
        }
    }

    const typeLabel = (type: Notification['notification_type']) => {
        if (type === 'message') return 'Mensagem'
        if (type === 'approval') return 'Aprovação'
        return 'Sistema'
    }

    const groups = [
        { key: 'today', label: 'Hoje', match: (d: Date) => isToday(d) },
        { key: 'yesterday', label: 'Ontem', match: (d: Date) => isYesterday(d) },
        { key: 'week', label: 'Esta semana', match: (d: Date) => isThisWeek(d, { weekStartsOn: 1 }) && !isToday(d) && !isYesterday(d) },
        { key: 'older', label: 'Anterior', match: () => true },
    ]

    const grouped = groups.map(g => ({
        ...g,
        items: notifications.filter(n => {
            const d = new Date(n.created_at)
            return g.match(d)
        })
    })).filter(g => g.items.length > 0)

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full h-10 w-10 border bg-muted/30 hover:bg-muted/50 transition-all shadow-sm group"
                    aria-label="Abrir notificações"
                >
                    <motion.div
                        animate={unreadCount > 0 ? {
                            rotate: [0, 15, -15, 15, -15, 0],
                        } : {}}
                        transition={{
                            repeat: Infinity,
                            duration: 2,
                            repeatDelay: 5
                        }}
                    >
                        <Bell className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
                    </motion.div>

                    <AnimatePresence>
                        {unreadCount > 0 && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                className="absolute -top-1 -right-1"
                            >
                                <Badge className="h-5 min-w-[20px] px-1 flex items-center justify-center bg-destructive text-destructive-foreground border-2 border-background font-bold text-[10px] animate-pulse">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </Badge>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 rounded-2xl overflow-hidden bg-popover border shadow-2xl mt-2">
                <div className="p-4 border-b border-border/50 bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="font-black text-sm uppercase tracking-tighter">Notificações</span>
                        {unreadCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] font-bold h-5 px-1.5">{unreadCount} novas</Badge>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-[10px] h-7 font-bold text-primary hover:bg-primary/10"
                            onClick={() => markAllAsRead()}
                        >
                            Marcar lidas
                        </Button>
                    )}
                </div>

                <ScrollArea className="h-[350px]">
                    <div className="flex flex-col">
                        <AnimatePresence initial={false}>
                            {(!Array.isArray(notifications) || notifications.length === 0) ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                    <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                                        <Bell className="h-6 w-6 text-muted-foreground/30" aria-hidden="true" />
                                    </div>
                                    <h4 className="font-bold text-sm">Tudo limpo por aqui</h4>
                                    <p className="text-xs text-muted-foreground">Você não tem notificações no momento.</p>
                                </div>
                            ) : (
                                grouped.map((group) => (
                                    <div key={group.key}>
                                        <div className="px-4 pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                            {group.label}
                                        </div>
                                        {group.items.map((notification, index) => (
                                    <motion.div
                                            key={notification.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={cn(
                                            "p-4 border-b border-border/30 last:border-0 hover:bg-primary/5 transition-colors cursor-pointer relative group",
                                            !notification.is_read && "bg-primary/5"
                                        )}
                                        onClick={() => {
                                            markAsRead(notification.id)
                                            openFromNotification(notification)
                                        }}
                                    >
                                        <div className="flex gap-3">
                                            <div className="mt-1">
                                                <div className="h-8 w-8 rounded-lg bg-background border flex items-center justify-center shadow-sm">
                                                    {getIcon(notification.notification_type)}
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h5 className={cn(
                                                        "text-sm font-bold leading-none truncate",
                                                        !notification.is_read ? "text-foreground" : "text-muted-foreground"
                                                    )}>
                                                        {notification.title}
                                                    </h5>
                                                    <div className="flex items-center gap-2">
                                                        {typeof notification.aggregate_count === "number" && notification.aggregate_count > 1 && (
                                                            <Badge variant="secondary" className="text-[9px] h-5 px-2">
                                                                {notification.aggregate_count}
                                                            </Badge>
                                                        )}
                                                        <Badge variant="outline" className="text-[9px] h-5 px-2">
                                                            {typeLabel(notification.notification_type)}
                                                        </Badge>
                                                        <span className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">
                                                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                                                        </span>
                                                        {!notification.is_read && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 text-[10px] font-bold px-2 hover:bg-primary/10"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    markAsRead(notification.id)
                                                                }}
                                                            >
                                                                Marcar lida
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const count = typeof notification.aggregate_count === "number" ? notification.aggregate_count : 1
                                                    const meta = (notification.metadata || {}) as Record<string, unknown>
                                                    const lastSnippet = typeof meta.last_snippet === "string" ? meta.last_snippet : null
                                                    const raw = notification.message || ""
                                                    const main = count > 1 && raw.includes("Último:") ? raw.split("Último:")[0].trim() : raw
                                                    return (
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                                                {main}
                                                            </p>
                                                            {count > 1 && lastSnippet && (
                                                                <p className="text-[11px] text-muted-foreground/80 line-clamp-2">
                                                                    Último: {lastSnippet}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )
                                                })()}
                                                {notification.link && (
                                                    <button
                                                        className="inline-flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-widest mt-2 hover:underline"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            markAsRead(notification.id)
                                                            openFromNotification(notification)
                                                        }}
                                                    >
                                                        {notification.notification_type === 'message' ? 'Abrir conversa' : 'Ver detalhe'} <ExternalLink className="h-2 w-2" aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {!notification.is_read && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]" aria-hidden="true" />
                                        )}
                                    </motion.div>
                                        ))}
                                    </div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </ScrollArea>

                <div className="p-2 border-t border-border/50 bg-muted/20">
                    <Button variant="ghost" asChild className="w-full text-[10px] font-black uppercase tracking-widest h-8 hover:bg-primary/5 group">
                        <Link href="/notificacoes" className="flex items-center justify-center gap-2">
                            Ver histórico completo
                            <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                        </Link>
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
