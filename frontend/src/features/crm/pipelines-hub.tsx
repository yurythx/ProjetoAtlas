"use client"

import Link from "next/link"
import { useMemo, useState, useEffect } from "react"
import { BarChart3, ChevronDown, ChevronRight, LayoutGrid, Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModuleGuard } from "@/components/module-guard"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

import { getDeadlineMeta, isCriticalDeal } from "./crm-visuals"
import { getPipelineColumns, isDealInColumn, resolveDealProgress, useCRM, type Deal, type Pipeline } from "./use-crm"
import { getUserDisplayName } from "./crm-utils"
import { useCRMUsers } from "./use-crm-users"
import { useRouter } from "next/navigation"
import { PipelineManagerModal } from "./pipeline-manager-modal"
import { usePermission } from "@/hooks/use-permission"

function isDealInPipeline(deal: Deal, pipeline: Pipeline) {
  if (deal.column_data?.pipeline) {
    return deal.column_data.pipeline === pipeline.id
  }
  if (deal.stage) {
    return pipeline.stages.some((stage) => stage.id === deal.stage)
  }
  return false
}

function getDealProgressForPipeline(deal: Deal, pipeline: Pipeline) {
  return resolveDealProgress(deal, pipeline)
}

function getPipelineStats(pipeline: Pipeline, deals: Deal[]) {
  const pipelineDeals = deals.filter((deal) => isDealInPipeline(deal, pipeline))
  const openDeals = pipelineDeals.filter((deal) => !deal.is_closed)
  const closedDeals = pipelineDeals.filter((deal) => deal.is_closed)
  const overdue = openDeals.filter((deal) => getDeadlineMeta(deal.closing_date, false).risk === "overdue").length

  const progressValues = pipelineDeals.map((deal) => getDealProgressForPipeline(deal, pipeline))
  const averageProgress = progressValues.length
    ? Math.round(progressValues.reduce((acc, value) => acc + value, 0) / progressValues.length)
    : 0

  return {
    total: pipelineDeals.length,
    open: openDeals.length,
    closed: closedDeals.length,
    overdue,
    averageProgress,
  }
}

type PipelineActivityItem = {
  id: number
  dealId: number
  dealTitle: string
  activityType: string
  description: string
  actorName: string
  createdAt: string
}

function formatActivityType(type: string) {
  if (type === "column_change") return "Movimentação"
  if (type === "stage_change") return "Movimentação"
  if (type === "note") return "Atualização"
  if (type === "automation") return "Automação"
  if (type === "creation") return "Criação"
  return type
}

export function PipelinesHub({ autoRedirect = false }: { autoRedirect?: boolean }) {
  const router = useRouter()
  const { pipelines, deals, isLoading } = useCRM()
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"progress" | "overdue" | "open" | "name">("progress")
  const { data: users = [] } = useCRMUsers(true)
  const { hasPermission } = usePermission()
  const canManagePipelines = hasPermission("crm.pipeline_manage")

  useEffect(() => {
    if (autoRedirect && !isLoading && pipelines.length === 1) {
      router.push(`/crm?pipeline=${pipelines[0].id}`)
    }
  }, [autoRedirect, isLoading, pipelines, router])

  const pipelineCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const rows = pipelines.map((pipeline) => {
      const stats = getPipelineStats(pipeline, deals)
      const columns = getPipelineColumns(pipeline)
      const pipelineDeals = deals.filter((deal) => isDealInPipeline(deal, pipeline))

      const ownerIds = Array.from(
        new Set(
          pipelineDeals
            .map((deal) => deal.owner)
            .filter((id): id is number => typeof id === "number" && id > 0),
        ),
      )
      const owners = ownerIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is NonNullable<typeof u> => Boolean(u))

      const columnSummary = columns.map((column) => {
        const colDeals = pipelineDeals.filter((deal) => isDealInColumn(deal, column))
        const open = colDeals.filter((deal) => !deal.is_closed).length
        const total = colDeals.length
        return { column, open, total }
      })

      const focusCards = pipelineDeals
        .filter((deal) => !deal.is_closed)
        .map((deal) => {
          const deadline = getDeadlineMeta(deal.closing_date, deal.is_closed)
          const progress = getDealProgressForPipeline(deal, pipeline)
          const critical = isCriticalDeal(deal)
          return { deal, deadline, progress, critical }
        })
        .filter((item) => item.deadline.risk === "overdue" || item.critical)
        .sort((a, b) => {
          const ar = a.deadline.risk === "overdue" ? 1 : 0
          const br = b.deadline.risk === "overdue" ? 1 : 0
          if (br !== ar) return br - ar
          const ac = a.critical ? 1 : 0
          const bc = b.critical ? 1 : 0
          if (bc !== ac) return bc - ac
          return (b.progress ?? 0) - (a.progress ?? 0)
        })
        .slice(0, 3)

      const recentActivities: PipelineActivityItem[] = pipelineDeals
        .flatMap((deal) => {
          const activities = Array.isArray(deal.activities) ? deal.activities : []
          return activities.map((activity) => ({
            id: activity.id,
            dealId: deal.id,
            dealTitle: deal.title,
            activityType: activity.activity_type,
            description: activity.description,
            actorName: activity.actor_name,
            createdAt: activity.created_at,
          }))
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)

      return {
        pipeline,
        stats,
        columns,
        owners,
        ownerCount: ownerIds.length,
        columnSummary,
        focusCards,
        recentActivities,
      }
    })

    const filtered = normalizedSearch
      ? rows.filter((row) => row.pipeline.name.toLowerCase().includes(normalizedSearch))
      : rows

    return filtered.sort((a, b) => {
      if (sort === "name") return a.pipeline.name.localeCompare(b.pipeline.name)
      if (sort === "overdue") return b.stats.overdue - a.stats.overdue || b.stats.open - a.stats.open
      if (sort === "open") return b.stats.open - a.stats.open || b.stats.overdue - a.stats.overdue
      return b.stats.averageProgress - a.stats.averageProgress || b.stats.open - a.stats.open
    })
  }, [deals, pipelines, search, sort, users])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-48 w-full rounded-[2.5rem] animate-pulse bg-muted/20" />
        <div className="grid gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => (
             <div key={i} className="h-80 rounded-[2.5rem] animate-pulse bg-muted/10" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ModuleGuard moduleCode="crm">
      <div className="space-y-10 pb-20 max-w-[1600px] mx-auto px-4">
        {/* Header Glass Section */}
        <div className="relative overflow-hidden rounded-[3rem] bg-slate-950 p-10 md:p-14 text-white shadow-2xl">
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-primary/30 to-transparent" />
          <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-primary/10 blur-[100px]" />
          
          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white/10 backdrop-blur-xl border border-white/10 text-primary-foreground shadow-2xl">
                  <BarChart3 className="h-8 w-8" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter leading-none uppercase">PIPELINES HUB</h1>
                  <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">ITIL Version 5 Value Stream Management</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative group w-full sm:w-72">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="LOCALIZAR FLUXO..."
                  className="h-14 w-full bg-white/5 border-white/10 rounded-2xl pl-12 focus-visible:ring-primary/40 text-white placeholder:text-slate-500 font-bold"
                />
                <LayoutGrid className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              </div>

              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger className="h-14 w-full sm:w-56 bg-white/5 border-white/10 rounded-2xl text-white font-black uppercase text-[11px] tracking-wider">
                  <SelectValue placeholder="ORDENAR POR" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-white/10 bg-slate-900 text-white font-bold">
                  <SelectItem value="progress">PROGRESSO MÁXIMO</SelectItem>
                  <SelectItem value="overdue">PENDÊNCIAS CRÍTICAS</SelectItem>
                  <SelectItem value="open">VOLUME ATIVO</SelectItem>
                  <SelectItem value="name">ORDEM ALFABÉTICA</SelectItem>
                </SelectContent>
              </Select>

              {canManagePipelines && (
                <PipelineManagerModal>
                    <Button className="h-14 px-10 bg-primary hover:bg-white hover:text-primary text-white rounded-2xl font-black text-[12px] tracking-[0.1em] transition-all shadow-xl shadow-primary/20 active:scale-95 uppercase">
                      NOVO PIPELINE
                    </Button>
                </PipelineManagerModal>
              )}
            </div>
          </div>
        </div>

        {/* Pipeline Responsive Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {pipelineCards.map(({ pipeline, stats, owners, ownerCount, focusCards }) => {
            const isAtRisk = stats.overdue > 0;
            const progressColor = isAtRisk ? "text-rose-500" : stats.averageProgress >= 80 ? "text-emerald-500" : "text-primary";
            
            return (
              <div
                key={pipeline.id}
                className="group relative flex flex-col rounded-[2.5rem] border border-primary/5 bg-card/40 backdrop-blur-xl transition-all duration-500 hover:bg-card/60 hover:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] hover:-translate-y-2 overflow-hidden"
              >
                <div className="p-8 space-y-8 flex-1">
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black tracking-tight leading-none group-hover:text-primary transition-colors">{pipeline.name}</h3>
                      <div className="flex items-center gap-2">
                         {isAtRisk ? (
                            <Badge className="bg-rose-500 text-white border-none rounded-full text-[9px] font-black px-3 py-1 shadow-lg shadow-rose-500/20">
                              CRÍTICO
                            </Badge>
                         ) : (
                            <Badge className="bg-emerald-500 text-white border-none rounded-full text-[9px] font-black px-3 py-1 shadow-lg shadow-emerald-500/20">
                              OPERACIONAL
                            </Badge>
                         )}
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stats.total} CARDS NO FLUXO</span>
                      </div>
                    </div>
                    <Link href={`/crm?pipeline=${pipeline.id}`}>
                       <motion.div 
                         whileHover={{ scale: 1.1 }}
                         whileTap={{ scale: 0.9 }}
                         className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary cursor-pointer hover:bg-primary hover:text-white transition-all shadow-lg"
                       >
                          <ChevronRight className="h-6 w-6" />
                       </motion.div>
                    </Link>
                  </div>

                  {/* High Performance Metrics */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-3xl bg-slate-100/50 dark:bg-slate-900/50 p-4 text-center border border-white/5 transition-all group-hover:bg-primary/5">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Abertos</p>
                      <p className="text-2xl font-black">{stats.open}</p>
                    </div>
                    <div className="rounded-3xl bg-rose-500/5 p-4 text-center border border-rose-500/10">
                      <p className="text-[9px] font-black text-rose-500/60 uppercase tracking-widest mb-1">Overdue</p>
                      <p className={cn("text-2xl font-black", stats.overdue > 0 ? "text-rose-500" : "text-slate-300")}>
                        {stats.overdue}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-emerald-500/5 p-4 text-center border border-emerald-500/10">
                      <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest mb-1">Throughput</p>
                      <p className="text-2xl font-black text-emerald-600">{stats.closed}</p>
                    </div>
                  </div>

                  {/* Flow Health Progress */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between font-black uppercase text-[10px] tracking-[0.2em] text-slate-400">
                      <span>Value Stream Efficiency</span>
                      <span className={progressColor}>{stats.averageProgress}%</span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden p-1 shadow-inner">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${stats.averageProgress}%` }}
                         className={cn("h-full rounded-full transition-all duration-1000", isAtRisk ? "bg-rose-500" : "bg-primary")}
                       />
                    </div>
                  </div>

                  {/* Team Avatars */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex -space-x-4 overflow-hidden">
                       {owners.slice(0, 5).map((u) => (
                         <Avatar key={u.id} className="h-10 w-10 border-[3px] border-card group-hover:border-white transition-colors">
                            <AvatarImage src={u.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-[10px] font-black text-primary">
                               {getUserDisplayName(u).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                         </Avatar>
                       ))}
                       {ownerCount > 5 && (
                         <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 border-[3px] border-card text-[10px] font-black">
                           +{ownerCount - 5}
                         </div>
                       )}
                    </div>
                    <Link href={`/crm/pipelines/${pipeline.id}`}>
                      <Button variant="ghost" className="text-[10px] font-black tracking-widest p-0 h-auto hover:text-primary hover:bg-transparent group/link">
                        CONFIGURAR FLUXO <ChevronRight className="ml-1 h-3 w-3 translate-x-0 group-hover/link:translate-x-1 transition-transform" />
                      </Button>
                    </Link>
                  </div>
                </div>

                {/* Hotspot Action Panel */}
                <AnimatePresence>
                  {focusCards.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="px-8 pb-8"
                    >
                        <div className="rounded-[2rem] bg-slate-900 p-5 space-y-4 border border-white/5 shadow-2xl">
                           <div className="flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                             <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">PONTOS DE ATENÇÃO Imediata</p>
                           </div>
                           <div className="space-y-3">
                              {focusCards.map((fc) => (
                                 <div key={fc.deal.id} className="flex items-center gap-3 text-[11px] group/item cursor-pointer">
                                    <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center group-hover/item:bg-primary/20 transition-colors">
                                       <Target className="h-4 w-4 text-slate-400 group-hover/item:text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-bold text-white truncate">{fc.deal.title}</p>
                                      <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">{fc.deadline.label}</p>
                                    </div>
                                    <ChevronRight className="h-3 w-3 text-slate-600 group-hover/item:text-white transition-colors" />
                                 </div>
                              ))}
                           </div>
                        </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {pipelineCards.length === 0 && (
          <div className="py-20 text-center flex flex-col items-center gap-6 glass rounded-[3rem] border border-dashed border-primary/20 bg-primary/5">
             <div className="h-24 w-24 rounded-full bg-muted/20 flex items-center justify-center">
                <LayoutGrid className="h-10 w-10 text-muted-foreground/30" />
             </div>
             <div className="space-y-2">
                <h3 className="text-2xl font-black tracking-tight italic uppercase">NENHUM FLUXO MAPEADO</h3>
                <p className="text-slate-500 font-medium">Refine sua busca ou crie uma nova estrutura ITIL agora mesmo.</p>
             </div>
             {canManagePipelines && (
                <PipelineManagerModal>
                    <Button variant="outline" className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-[11px] hover:bg-primary hover:text-white transition-all">
                      Iniciar Novo Processo
                    </Button>
                </PipelineManagerModal>
             )}
          </div>
        )}
      </div>
    </ModuleGuard>
  )
}
