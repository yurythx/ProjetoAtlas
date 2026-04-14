"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { History, Search, Filter, Activity, Database, Info } from "lucide-react"
import { useState } from "react"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Protected } from "@/components/auth/protected"

export default function AuditPage() {
    const [searchTerm, setSearchTerm] = useState("")
    const [actionFilter, setActionFilter] = useState("all")
    const [isDetailsOpen, setIsDetailsOpen] = useState(false)
    const [selectedLog, setSelectedLog] = useState<{
        id: number
        action: string
        user_name?: string
        user_email?: string
        resource: string
        resource_id: string | number
        ip_address?: string | null
        created_at: string
        details?: unknown
    } | null>(null)

    const formatDateTime = (value: string) => {
        const dt = new Date(value)
        if (Number.isNaN(dt.getTime())) return ""
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(dt)
    }

    const { data: logs, isLoading } = useQuery({
        queryKey: ['audit-logs', searchTerm, actionFilter],
        queryFn: async () => {
            let url = '/api/core/audit-logs/'
            const params = new URLSearchParams()
            if (actionFilter !== 'all') params.append('action', actionFilter)
            if (searchTerm) params.append('search', searchTerm)
            if (params.toString()) url += `?${params.toString()}`

            const res = await api.get(url)
            const data = res.data.results || res.data
            return Array.isArray(data) ? data : []
        }
    })

    const safeLogs = Array.isArray(logs) ? logs : []

    // Cores por tipo de ação
    const getActionBadge = (action: string) => {
        switch (action) {
            case 'create': return <Badge className="bg-green-500/10 text-green-600 border-green-200">CREATE</Badge>
            case 'update': return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">UPDATE</Badge>
            case 'delete': return <Badge className="bg-red-500/10 text-red-600 border-red-200">DELETE</Badge>
            case 'login': return <Badge className="bg-purple-500/10 text-purple-600 border-purple-200">LOGIN</Badge>
            default: return <Badge variant="outline">{action.toUpperCase()}</Badge>
        }
    }

    return (
        <Protected requiredPermissions={['admin.view_dashboard']}>
        <div className="max-w-6xl mx-auto py-8 space-y-8">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black tracking-tight flex items-center gap-4 bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                <History className="h-8 w-8 text-primary" aria-hidden="true" />
                            </div>
                            Logs de Auditoria
                        </h1>
                        <p className="text-muted-foreground text-lg ml-1">Rastreie todas as atividades críticas realizadas no sistema.</p>
                    </div>
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2 relative group">
                        <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <Input
                            placeholder="Pesquisar por recurso, ID ou usuário..."
                            className="pl-11 h-14 rounded-2xl bg-card/50 backdrop-blur-md border border-border/50 shadow-sm focus-visible:ring-primary/20 transition-all text-base"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Pesquisar logs de auditoria"
                        />
                    </div>
                    <div className="relative group">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                        <select
                            className="w-full h-14 pl-11 pr-4 rounded-2xl bg-card/50 backdrop-blur-md border border-border/50 shadow-sm appearance-none focus:ring-2 focus:ring-primary/20 text-sm font-bold cursor-pointer transition-all"
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                            aria-label="Filtrar por ação"
                        >
                            <option value="all">Todas as Ações</option>
                            <option value="create">Criação (Create)</option>
                            <option value="update">Edição (Update)</option>
                            <option value="delete">Exclusão (Delete)</option>
                            <option value="login">Login</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="animate-in fade-in duration-300">
                <div className="rounded-[2.5rem] border border-border/50 bg-card/30 backdrop-blur-xl overflow-hidden shadow-2xl relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />

                    <div className="sm:hidden p-4 space-y-3">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="rounded-2xl border border-border/50 bg-background/60 p-4 animate-pulse">
                                    <div className="flex items-center justify-between">
                                        <div className="h-4 w-24 bg-muted rounded" />
                                        <div className="h-4 w-16 bg-muted rounded" />
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <div className="h-4 w-48 bg-muted rounded" />
                                        <div className="h-3 w-40 bg-muted rounded opacity-70" />
                                    </div>
                                </div>
                            ))
                        ) : safeLogs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                                <div className="p-6 rounded-full bg-muted/20">
                                    <History className="h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold">Nenhum rastro encontrado</h3>
                                    <p className="text-muted-foreground">Ajuste os filtros e tente novamente.</p>
                                </div>
                            </div>
                        ) : (
                            safeLogs.map((log: {
                                id: number
                                action: string
                                user_name?: string
                                user_email?: string
                                resource: string
                                resource_id: string | number
                                ip_address?: string | null
                                created_at: string
                                details?: unknown
                            }) => (
                                <div key={log.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {getActionBadge(log.action)}
                                                <span className="text-xs font-bold text-muted-foreground truncate">
                                                    {formatDateTime(log.created_at)}
                                                </span>
                                            </div>
                                            <div className="font-bold truncate">
                                                {log.resource} <span className="text-muted-foreground">#{log.resource_id}</span>
                                            </div>
                                            <div className="text-sm text-muted-foreground truncate">
                                                {log.user_name || "Sistema"} · {log.user_email || "Atlas Daemon"}
                                            </div>
                                            <div className="text-xs font-mono text-muted-foreground">
                                                {log.ip_address || "Internal"}
                                            </div>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 rounded-xl"
                                            onClick={() => {
                                                setSelectedLog(log)
                                                setIsDetailsOpen(true)
                                            }}
                                        >
                                            Detalhes
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="hidden sm:block">
                    <Table aria-label="Tabela de logs de auditoria" className="min-w-[980px]">
                        <TableHeader>
                            <TableRow className="border-border/50 hover:bg-transparent bg-muted/20">
                                <TableHead className="py-6 pl-4 sm:pl-10 font-bold text-foreground">Evento</TableHead>
                                <TableHead className="font-bold text-foreground">Usuário</TableHead>
                                <TableHead className="font-bold text-foreground">Recurso</TableHead>
                                <TableHead className="font-bold text-foreground">IP</TableHead>
                                <TableHead className="font-bold text-foreground">Data</TableHead>
                                <TableHead className="text-right pr-4 sm:pr-10 font-bold text-foreground">Detalhes</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody role={isLoading ? "status" : undefined} aria-live={isLoading ? "polite" : undefined} aria-label={isLoading ? "Carregando logs" : undefined}>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i} className="border-border/50">
                                        <TableCell colSpan={6} className="h-24 animate-pulse bg-muted/5">
                                            <div className="flex items-center gap-4 px-10">
                                                <div className="h-12 w-12 rounded-2xl bg-muted" />
                                                <div className="space-y-2 flex-1">
                                                    <div className="h-4 w-32 bg-muted rounded" />
                                                    <div className="h-3 w-48 bg-muted rounded opacity-50" />
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : safeLogs.map((log: {
                                id: number
                                action: string
                                user_name?: string
                                user_email?: string
                                resource: string
                                resource_id: string | number
                                ip_address?: string | null
                                created_at: string
                                details?: unknown
                              }) => (
                                <TableRow key={log.id} className="group hover:bg-primary/5 transition-all border-border/30">
                                    <TableCell className="py-6 pl-4 sm:pl-10">
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl bg-background border border-border/50 flex items-center justify-center shadow-premium group-hover:scale-110 transition-transform">
                                                <Activity className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
                                            </div>
                                            {getActionBadge(log.action)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-black text-sm text-foreground/90">{log.user_name || 'Sistema'}</span>
                                            <span className="text-[10px] uppercase font-black text-muted-foreground tracking-tighter opacity-70">
                                                {log.user_email || 'Atlas Daemon'}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 rounded-lg bg-primary/10">
                                                <Database className="h-4 w-4 text-primary" aria-hidden="true" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black uppercase tracking-widest opacity-60">Recurso</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-black">{log.resource}</span>
                                                    <Badge variant="outline" className="text-[9px] font-black h-4 px-1 border-primary/20 text-primary">ID: {log.resource_id}</Badge>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs font-mono font-bold text-muted-foreground">
                                        {log.ip_address || "Internal"}
                                    </TableCell>
                                    <TableCell className="text-xs font-bold">
                                        {formatDateTime(log.created_at)}
                                    </TableCell>
                                    <TableCell className="text-right pr-4 sm:pr-10">
                                            <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-background/90 hover:bg-primary/10 border border-transparent hover:border-primary/20 shadow-sm transition-all" aria-label="Ver detalhes do evento">
                                                            <Info className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-[400px] p-0 rounded-2xl border border-border/50 shadow-2xl overflow-hidden">
                                                    <div className="bg-primary/10 p-3 border-b border-border/50 flex items-center gap-2">
                                                            <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
                                                        <span className="text-xs font-black uppercase tracking-widest">Detalhes do Evento</span>
                                                    </div>
                                                    <pre className="p-4 text-[11px] bg-card font-mono text-foreground/80 leading-relaxed overflow-auto max-h-[300px]">
                                                        {JSON.stringify(log.details, null, 2)}
                                                    </pre>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {!isLoading && safeLogs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
                            <div className="p-6 rounded-full bg-muted/20">
                                <History className="h-12 w-12 text-muted-foreground/30" aria-hidden="true" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Nenhum rastro encontrado</h3>
                                <p className="text-muted-foreground">O sistema está limpo. Tente ajustar seus filtros.</p>
                            </div>
                        </div>
                    )}
                    </div>
                </div>
            </div>

            <Dialog
                open={isDetailsOpen}
                onOpenChange={(open) => {
                    setIsDetailsOpen(open)
                    if (!open) setSelectedLog(null)
                }}
            >
                <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[720px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr]">
                    <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                        <DialogTitle>Detalhes do Evento</DialogTitle>
                        <DialogDescription className="sr-only">Detalhes do log de auditoria.</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
                        <pre className="text-[11px] bg-card font-mono text-foreground/80 leading-relaxed overflow-auto rounded-xl border p-4">
                            {selectedLog ? JSON.stringify(selectedLog.details, null, 2) : ""}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </Protected>
    )
}
