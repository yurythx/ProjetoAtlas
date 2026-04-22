"use client"

import { Bell, Check, MessageSquare, Info, ExternalLink, ChevronRight, AlertTriangle, DollarSign, Users, Briefcase, Zap, Inbox, CheckCircle2 } from "lucide-react"
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
            if (n.link) {
                router.push(n.link)
            }
        } catch {
            if (n.link) router.push(n.link)
        }
    }

    const getIcon = (n: Notification) => {
        if (n.icon === 'DollarSign' || n.module === 'finance') return <DollarSign className="h-5 w-5 text-emerald-500" />
        if (n.icon === 'Users' || n.module === 'crm') return <Users className="h-5 w-5 text-indigo-500" />
        if (n.priority === 'urgent') return <AlertTriangle className="h-5 w-5 text-rose-500" />
        
        switch (n.notification_type) {
            case 'message': return <MessageSquare className="h-5 w-5 text-blue-500" aria-hidden="true" />
            case 'approval': return <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            default: return <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
        }
    }

    const getPriorityColor = (priority: Notification['priority']) => {
        switch (priority) {
            case 'urgent': return "bg-rose-500/10 text-rose-500 border-rose-500/20"
            case 'high': return "bg-amber-500/10 text-amber-500 border-amber-500/20"
            default: return "bg-muted/10 text-muted-foreground border-white/5"
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
                    className="relative rounded-2xl h-11 w-11 bg-white/5 border border-white/10 hover:bg-white/10 transition-all shadow-lg group"
                    aria-label="Abrir notificações"
                >
                    <motion.div
                        animate={unreadCount > 0 ? {
                            rotate: [0, 10, -10, 10, -10, 0],
                        } : {}}
                        transition={{
                            repeat: Infinity,
                            duration: 2.5,
                            repeatDelay: 4
                        }}
                    >
                        <Bell className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
                    </motion.div>

                    <AnimatePresence>
                        {unreadCount > 0 && (
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                className="absolute -top-1 -right-1"
                            >
                                <div className="h-5 min-w-[20px] px-1.5 flex items-center justify-center bg-primary text-primary-foreground border-2 border-background rounded-full font-black text-[9px] shadow-lg shadow-primary/20">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[380px] p-0 rounded-[2.5rem] overflow-hidden bg-background/30 backdrop-blur-3xl border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] mt-4 animate-in zoom-in-95 duration-200">
                <div className="px-6 py-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg">
                           <Zap className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex flex-col">
                           <span className="font-black text-[11px] uppercase tracking-[0.2em] text-foreground">Sinais Atlas</span>
                           {unreadCount > 0 ? (
                               <span className="text-[10px] font-black text-primary uppercase tracking-widest">{unreadCount} pendentes</span>
                           ) : (
                               <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">Tudo limpo</span>
                           )}
                        </div>
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-[9px] h-8 px-4 rounded-xl font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-all active:scale-95"
                            onClick={() => markAllAsRead()}
                        >
                            Limpar Base
                        </Button>
                    )}
                </div>

                <ScrollArea className="h-[420px]">
                    <div className="flex flex-col">
                        <AnimatePresence initial={false}>
                            {(!Array.isArray(notifications) || notifications.length === 0) ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center px-8 space-y-4">
                                    <div className="h-20 w-20 rounded-[2rem] bg-white/2 border border-white/5 flex items-center justify-center shadow-inner">
                                        <Inbox className="h-10 w-10 text-muted-foreground/20" aria-hidden="true" />
                                    </div>
                                    <div className="space-y-1">
                                       <h4 className="font-black text-xs uppercase tracking-widest opacity-30">Silêncio Absoluto</h4>
                                       <p className="text-[10px] text-muted-foreground/30 font-bold uppercase tracking-tighter">Nenhum sinal detectado no momento.</p>
                                    </div>
                                </div>
                            ) : (
                                grouped.map((group) => (
                                    <div key={group.key}>
                                        <div className="px-6 pt-6 pb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 border-b border-white/2">
                                            {group.label}
                                        </div>
                                        {group.items.map((notification, index) => (
                                    <motion.div
                                            key={notification.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.03 }}
                                        className={cn(
                                            "px-6 py-6 border-b border-white/5 last:border-0 hover:bg-white/5 transition-all cursor-pointer relative group",
                                            !notification.is_read && "bg-white/5"
                                        )}
                                        onClick={() => {
                                            markAsRead(notification.id)
                                            openFromNotification(notification)
                                        }}
                                    >
                                        <div className="flex gap-4">
                                            <div className="shrink-0">
                                                <div className={cn(
                                                   "h-12 w-12 rounded-2xl flex items-center justify-center border shadow-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3",
                                                   notification.is_read ? "bg-white/2 border-white/5" : "bg-white/5 border-white/10"
                                                )}>
                                                    {getIcon(notification)}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0 space-y-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <h5 className={cn(
                                                        "text-sm font-black tracking-tighter uppercase truncate transition-colors",
                                                        !notification.is_read ? "text-foreground group-hover:text-primary" : "text-foreground/40"
                                                    )}>
                                                        {notification.title}
                                                    </h5>
                                                    <span className="text-[9px] font-black text-muted-foreground/30 shrink-0 uppercase tracking-tighter">
                                                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: ptBR })}
                                                    </span>
                                                </div>
                                                
                                                <p className={cn(
                                                   "text-xs leading-relaxed font-bold line-clamp-2",
                                                   notification.is_read ? "text-muted-foreground/30" : "text-muted-foreground"
                                                )}>
                                                   {notification.message}
                                                </p>
                                                
                                                <div className="flex items-center gap-3">
                                                    {typeof notification.aggregate_count === "number" && notification.aggregate_count > 1 && (
                                                        <Badge className="bg-primary/5 text-primary border-primary/10 text-[8px] h-4 px-2 font-black rounded-lg">
                                                            X{notification.aggregate_count}
                                                        </Badge>
                                                    )}
                                                    {notification.priority !== 'medium' && (
                                                        <Badge variant="outline" className={cn("text-[8px] h-4 px-2 font-black uppercase tracking-tighter rounded-lg", getPriorityColor(notification.priority))}>
                                                            {notification.priority}
                                                        </Badge>
                                                    )}
                                                    <span className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground/30">
                                                       {typeLabel(notification.notification_type)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        {!notification.is_read && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),1)] animate-pulse" aria-hidden="true" />
                                        )}
                                    </motion.div>
                                        ))}
                                    </div>
                                ))
                            )}
                        </AnimatePresence>
                    </div>
                </ScrollArea>

                <div className="p-4 border-t border-white/5 bg-white/5">
                    <Button variant="ghost" asChild className="w-full text-[10px] font-black uppercase tracking-widest h-10 rounded-2xl hover:bg-primary hover:text-primary-foreground transition-all group">
                        <Link href="/notificacoes" className="flex items-center justify-center gap-3">
                            <History className="h-4 w-4" />
                            Acessar Central Completa
                            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                        </Link>
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}
