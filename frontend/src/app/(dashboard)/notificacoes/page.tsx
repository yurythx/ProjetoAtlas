"use client"

import { useNotifications, Notification } from "@/hooks/use-notifications-v2"
import { Button } from "@/components/ui/button"
import { Bell, MessageSquare, ShieldCheck, CheckCircle2, Calendar, ChevronRight, Search, DollarSign, Users, AlertTriangle, Sparkles, Zap, Trash2, History, Inbox } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useDebounce } from "@/hooks/use-debounce"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

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

    const getIcon = (n: Notification) => {
        if (n.icon === 'DollarSign' || n.module === 'finance') return <DollarSign className="h-6 w-6 text-emerald-500" />
        if (n.icon === 'Users' || n.module === 'crm') return <Users className="h-6 w-6 text-indigo-500" />
        if (n.priority === 'urgent') return <AlertTriangle className="h-6 w-6 text-rose-500" />
        
        switch (n.notification_type) {
            case 'message': return <MessageSquare className="h-6 w-6 text-blue-500" />
            case 'approval': return <ShieldCheck className="h-6 w-6 text-amber-500" />
            default: return <Bell className="h-6 w-6 text-primary" />
        }
    }

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'message': return 'Mensagens'
            case 'approval': return 'Aprovações'
            default: return 'Sistema'
        }
    }

    return (
        <div className="max-w-6xl mx-auto py-12 px-6 space-y-12 animate-in fade-in duration-1000 relative">
            {/* Decorative blurs */}
            <div className="absolute -top-40 -right-40 h-[600px] w-[600px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 h-[600px] w-[600px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

            {/* Hero Section Modernized */}
            <div className="relative group overflow-hidden bg-white/5 backdrop-blur-[40px] p-12 rounded-[3.5rem] border border-white/10 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-10 transition-all hover:border-white/20">
                <div className="absolute -top-10 -right-10 p-12 opacity-5 rotate-12 transition-transform group-hover:rotate-6 duration-700">
                    <Bell className="h-64 w-64 text-primary" />
                </div>
                
                <div className="space-y-4 relative z-10">
                    <div className="flex items-center gap-3">
                       <div className="h-16 w-16 rounded-[1.5rem] bg-primary/10 border border-primary/20 flex items-center justify-center shadow-xl shadow-primary/10 transition-transform group-hover:scale-110 duration-500">
                          <Zap className="h-8 w-8 text-primary" />
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/60">Atlas Command Center</span>
                          <h1 className="text-5xl font-black tracking-tighter uppercase leading-none">Central de <span className="text-primary">Alertas</span></h1>
                       </div>
                    </div>
                    <p className="text-muted-foreground text-lg ml-1 font-bold max-w-xl leading-relaxed opacity-70">
                       Gestão estratégica de notificações P2P e sinais vitais do ecossistema corporativo Atlas.
                    </p>
                </div>

                <div className="relative z-10 shrink-0">
                    <Button
                        variant="outline"
                        onClick={markAllAsRead}
                        className="h-16 px-10 rounded-2xl border-white/10 bg-white/5 hover:bg-primary hover:text-primary-foreground hover:border-primary font-black uppercase tracking-widest text-[11px] shadow-2xl transition-all active:scale-95 group/btn"
                    >
                        <CheckCircle2 className="mr-3 h-5 w-5 text-emerald-500 group-hover/btn:text-primary-foreground transition-colors" />
                        Limpar Todos os Alertas
                    </Button>
                </div>
            </div>

            {/* Search & Filter Engine */}
            <div className="flex flex-col md:flex-row gap-6 items-center">
                <div className="relative flex-1 group w-full">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-all duration-300" />
                    <Input
                        placeholder="Pesquisar no meta-histórico de alertas..."
                        className="pl-16 h-16 rounded-2xl bg-white/5 backdrop-blur-3xl border-white/10 focus-visible:ring-primary/20 text-lg font-bold shadow-inner"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 p-2 bg-white/5 rounded-[2rem] border border-white/10 backdrop-blur-2xl shadow-xl">
                    {(['all', 'message', 'system', 'approval'] as const).map((t) => (
                        <Button
                            key={t}
                            variant={filter === t ? 'default' : 'ghost'}
                            onClick={() => setFilter(t)}
                            className={cn(
                                "rounded-[1.25rem] h-12 px-8 font-black uppercase tracking-widest text-[10px] transition-all duration-500",
                                filter === t 
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                    : "hover:bg-white/10 text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {t === 'all' ? 'Ver Tudo' : getTypeLabel(t)}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Notification List Container */}
            <div className="space-y-6">
                <AnimatePresence mode="popLayout">
                    {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-32 rounded-[2.5rem] bg-white/5 animate-pulse border border-white/5" />
                        ))
                    ) : filteredNotifications.length > 0 ? (
                        filteredNotifications.map((n: Notification, idx) => (
                            <motion.div
                                key={n.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: idx * 0.05 }}
                                className={cn(
                                    "group relative p-10 rounded-[3rem] border transition-all duration-500 cursor-pointer overflow-hidden",
                                    n.is_read
                                        ? "bg-white/2 border-white/5 opacity-50 grayscale-[0.5] hover:grayscale-0"
                                        : "bg-white/5 border-white/10 shadow-2xl hover:bg-white/10 hover:border-primary/20 hover:-translate-y-1"
                                )}
                                onClick={() => {
                                    markAsRead(n.id)
                                    openFromNotification(n)
                                }}
                            >
                                {/* Unread indicator glow */}
                                {!n.is_read && (
                                   <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)]" />
                                )}

                                {n.priority === 'urgent' && !n.is_read && (
                                    <div className="absolute top-0 right-12 -translate-y-1/2 px-6 py-2 rounded-full bg-rose-500 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-rose-500/30 animate-bounce">
                                        Nível Crítico
                                    </div>
                                )}
                                
                                <div className="flex items-start gap-10">
                                    <div className={cn(
                                        "h-20 w-20 rounded-[1.75rem] flex items-center justify-center border shadow-2xl transition-all duration-500 shrink-0",
                                        n.is_read ? "bg-white/2 border-white/5" : "bg-white/5 border-white/10 group-hover:scale-110 group-hover:rotate-3"
                                    )}>
                                        {getIcon(n)}
                                    </div>

                                    <div className="flex-1 space-y-4">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <h3 className={cn(
                                                   "text-2xl font-black tracking-tighter uppercase transition-colors",
                                                   n.is_read ? "text-foreground/60" : "text-foreground group-hover:text-primary"
                                                )}>
                                                    {n.title}
                                                </h3>
                                                {typeof n.aggregate_count === "number" && n.aggregate_count > 1 && (
                                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] h-6 px-3 rounded-xl font-black">
                                                       SINAL X{n.aggregate_count}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/40 shrink-0">
                                                <History className="h-3 w-3" />
                                                {formatDateTime(n.created_at)}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <p className={cn(
                                                "text-lg leading-relaxed font-bold tracking-tight",
                                                n.is_read ? "text-muted-foreground/50" : "text-muted-foreground"
                                            )}>
                                                {n.message}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-6 pt-2">
                                            {n.link && (
                                                <Button variant="link" className="p-0 h-auto text-[11px] font-black uppercase tracking-widest text-primary hover:no-underline group/link"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        markAsRead(n.id)
                                                        openFromNotification(n)
                                                    }}>
                                                    Acessar Recursos do Canal <ChevronRight className="ml-2 h-3 w-3 transition-transform group-hover/link:translate-x-1" />
                                                </Button>
                                            )}
                                            {!n.is_read && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                                                    className="h-auto p-0 text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 hover:text-foreground hover:bg-transparent"
                                                >
                                                    Desativar Alerta
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <div className="py-40 flex flex-col items-center justify-center text-center space-y-6 rounded-[4rem] border border-dashed border-white/10 bg-white/2 backdrop-blur-xl">
                            <div className="p-10 rounded-[2rem] bg-white/5 border border-white/10 shadow-2xl">
                                <Inbox className="h-20 w-20 text-primary opacity-20" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-3xl font-black tracking-tighter uppercase opacity-30">Zero Sinais de Alerta</h3>
                                <p className="text-muted-foreground/40 font-bold uppercase tracking-widest text-xs">Todos os sistemas operando em conformidade.</p>
                            </div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}
