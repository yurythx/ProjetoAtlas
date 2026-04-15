"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
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

function formatActivityTime(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export function PipelinesHub({ autoRedirect = false }: { autoRedirect?: boolean }) {
  const router = useRouter()
  const { pipelines, deals, isLoading } = useCRM()
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"progress" | "overdue" | "open" | "name">("progress")
  const [expandedPipelineId, setExpandedPipelineId] = useState<number | null>(null)
  const { data: users = [] } = useCRMUsers(expandedPipelineId !== null)
  const { hasPermission } = usePermission()
  const canManagePipelines = hasPermission("crm.pipeline_manage")

  useState(() => {
    if (typeof window !== "undefined") {
      // Pequeno hack para evitar flicker: se autoRedirect for true e já soubermos que tem 1, redirecionamos
    }
  })

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
      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="h-6 w-56 rounded bg-muted/30" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-[180px] rounded-3xl border bg-muted/10" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ModuleGuard moduleCode="crm">
      <div className="space-y-6">
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold">Pipelines (Visão Geral)</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhe o andamento geral e entre no Kanban quando precisar operar.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[240px_200px_auto_auto] lg:items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pipeline..."
                className="glass w-full"
              />
              <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
                <SelectTrigger className="glass w-full">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progresso</SelectItem>
                  <SelectItem value="overdue">Vencidos</SelectItem>
                  <SelectItem value="open">Abertos</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                </SelectContent>
              </Select>
              {canManagePipelines ? (
                <PipelineManagerModal
                  triggerLabel="Nova Pipeline"
                  triggerIcon="plus"
                  triggerVariant="default"
                  triggerClassName="w-full lg:w-auto"
                />
              ) : (
                <div className="hidden lg:block" />
              )}
              {pipelines[0]?.id ? (
                <Link href={`/crm?pipeline=${pipelines[0].id}`} className="w-full lg:w-auto">
                  <Button variant="outline" className="glass w-full lg:w-auto">
                    <LayoutGrid className="h-4 w-4" />
                    <span>Abrir Kanban</span>
                  </Button>
                </Link>
              ) : (
                <Button variant="outline" className="glass w-full lg:w-auto" disabled aria-label="Abrir Kanban">
                  <LayoutGrid className="h-4 w-4" />
                  <span>Abrir Kanban</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-card shadow-sm overflow-hidden">
          <div className="hidden lg:grid grid-cols-[minmax(260px,2fr)_140px_90px_90px_90px_160px_190px] gap-3 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground bg-muted/20 border-b">
            <div>Pipeline</div>
            <div>Progresso</div>
            <div>Abertos</div>
            <div>Vencidos</div>
            <div>Fechados</div>
            <div>Responsáveis</div>
            <div className="text-right">Ações</div>
          </div>

          {pipelineCards.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="text-lg font-semibold">Nenhuma pipeline encontrada</div>
              <div className="mt-2 text-sm text-muted-foreground">
                {search.trim()
                  ? "Tente remover o filtro de busca ou criar uma nova pipeline."
                  : "Crie uma pipeline para começar a organizar o fluxo de trabalho no CRM."}
              </div>
              {canManagePipelines ? (
                <div className="mt-6 flex justify-center">
                  <PipelineManagerModal triggerLabel="Nova Pipeline" triggerIcon="plus" triggerVariant="default" />
                </div>
              ) : null}
            </div>
          ) : (
          <div className="divide-y">
            {pipelineCards.map(({ pipeline, stats, columns, owners, ownerCount, columnSummary, focusCards, recentActivities }) => {
              const progressClass =
                stats.averageProgress >= 80
                  ? "bg-emerald-600"
                  : stats.averageProgress >= 45
                    ? "bg-blue-600"
                    : "bg-amber-600"
              const isExpanded = expandedPipelineId === pipeline.id
              const detailsId = `pipeline-${pipeline.id}-details`
              const statusBadge = (() => {
                if (stats.overdue > 0) {
                  return (
                    <Badge
                      variant="outline"
                      className="rounded-full border-rose-200 bg-rose-100 text-rose-800"
                    >
                      Atenção
                    </Badge>
                  )
                }
                if (stats.averageProgress >= 80) {
                  return (
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-100 text-emerald-800"
                    >
                      Saudável
                    </Badge>
                  )
                }
                return (
                  <Badge variant="outline" className="rounded-full">
                    Em andamento
                  </Badge>
                )
              })()

              return (
                <div key={pipeline.id}>
                  <div className="px-4 sm:px-6 py-4 hover:bg-muted/20 transition-colors">
                    <div className="lg:hidden space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              className="h-8 w-8 rounded-xl border bg-background flex items-center justify-center shrink-0 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                              aria-expanded={isExpanded}
                              aria-controls={detailsId}
                              onClick={() => setExpandedPipelineId(isExpanded ? null : pipeline.id)}
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                            </button>
                            <div className="truncate text-base font-semibold">{pipeline.name}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {statusBadge}
                            <Badge variant="secondary" className="rounded-full">
                              {stats.total} card{stats.total === 1 ? "" : "s"}
                            </Badge>
                            <Badge variant="outline" className="rounded-full">
                              {columns.length} coluna{columns.length === 1 ? "" : "s"}
                            </Badge>
                            <Badge variant="outline" className="rounded-full">
                              <Users className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              {ownerCount} pessoa{ownerCount === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        </div>
                        <Link href={`/crm?pipeline=${pipeline.id}`} className="shrink-0">
                          <Button variant="outline" className="glass h-10 rounded-xl" aria-label="Abrir Kanban">
                            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Abrir Kanban</span>
                            <span className="sm:hidden">Kanban</span>
                          </Button>
                        </Link>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border bg-background p-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Abertos</div>
                          <div className="mt-1 text-lg font-bold">{stats.open}</div>
                        </div>
                        <div className="rounded-2xl border bg-background p-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Vencidos</div>
                          <div className={cn("mt-1 text-lg font-bold", stats.overdue > 0 && "text-rose-600")}>
                            {stats.overdue}
                          </div>
                        </div>
                        <div className="rounded-2xl border bg-background p-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Fechados</div>
                          <div className="mt-1 text-lg font-bold">{stats.closed}</div>
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-background p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Progresso médio</div>
                          <div className="text-sm font-bold">{stats.averageProgress}%</div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className={cn("h-full rounded-full transition-all", progressClass)} style={{ width: `${stats.averageProgress}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Link href={`/crm/pipelines/${pipeline.id}`} className="w-full">
                          <Button className="w-full rounded-xl">
                            Detalhes
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          variant="outline"
                          className="glass w-full rounded-xl"
                          onClick={() => setExpandedPipelineId(isExpanded ? null : pipeline.id)}
                        >
                          {isExpanded ? "Recolher" : "Expandir"}
                        </Button>
                      </div>
                    </div>

                    <div className="hidden lg:grid grid-cols-[minmax(260px,2fr)_140px_90px_90px_90px_160px_190px] gap-3 items-center">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          className="h-8 w-8 rounded-xl border bg-background flex items-center justify-center shrink-0 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                          aria-expanded={isExpanded}
                          aria-controls={detailsId}
                          onClick={() => setExpandedPipelineId(isExpanded ? null : pipeline.id)}
                        >
                          <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="truncate font-semibold">{pipeline.name}</div>
                            {statusBadge}
                            <Badge variant="secondary" className="rounded-full">
                              {stats.total} card{stats.total === 1 ? "" : "s"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {columns.length} coluna{columns.length === 1 ? "" : "s"} • {ownerCount} responsável{ownerCount === 1 ? "" : "is"}
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-bold tabular-nums">{stats.averageProgress}%</div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className={cn("h-full rounded-full transition-all", progressClass)} style={{ width: `${stats.averageProgress}%` }} />
                        </div>
                      </div>

                      <div className="text-sm font-bold tabular-nums">{stats.open}</div>
                      <div className={cn("text-sm font-bold tabular-nums", stats.overdue > 0 && "text-rose-600")}>{stats.overdue}</div>
                      <div className="text-sm font-bold tabular-nums">{stats.closed}</div>

                      <div className="flex items-center gap-1.5 min-w-0">
                        {owners.slice(0, 3).map((u) => {
                          const label = getUserDisplayName(u)
                          return (
                            <Avatar key={u.id} className="h-7 w-7 border">
                              <AvatarImage src={u.avatar_url || undefined} alt={label} />
                              <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          )
                        })}
                        {ownerCount > 3 ? (
                          <Badge variant="secondary" className="rounded-full">
                            +{ownerCount - 3}
                          </Badge>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/crm/pipelines/${pipeline.id}`}>
                          <Button size="sm" className="rounded-xl">
                            Detalhes
                            <ChevronRight className="ml-2 h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`/crm?pipeline=${pipeline.id}`}>
                          <Button size="sm" variant="outline" className="glass rounded-xl">
                            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                            <span>Abrir Kanban</span>
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div id={detailsId} className="px-4 sm:px-6 pb-6">
                      <div className="space-y-3 rounded-2xl border bg-background p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Participantes
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-xl"
                            onClick={() => setExpandedPipelineId(null)}
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>

                        {owners.length ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {owners.slice(0, 10).map((u) => {
                              const label = getUserDisplayName(u)
                              return (
                                <div key={u.id} className="flex items-center gap-2 rounded-full border bg-card px-3 py-1">
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={u.avatar_url || undefined} alt={label} />
                                    <AvatarFallback>{label.slice(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="text-xs font-medium">{label}</div>
                                </div>
                              )
                            })}
                            {ownerCount > owners.length ? (
                              <Badge variant="secondary" className="rounded-full">
                                +{ownerCount - owners.length}
                              </Badge>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Nenhum responsável atribuído ainda.
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Colunas (cards abertos)
                          </div>
                          <div className="space-y-2">
                            {columnSummary.map(({ column, open, total }) => (
                              <div key={column.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{column.title}</div>
                                  <div className="text-xs text-muted-foreground">{total} total</div>
                                </div>
                                <Badge variant="outline" className="rounded-full">
                                  {open} aberto{open === 1 ? "" : "s"}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Destaques
                          </div>
                          {focusCards.length ? (
                            <div className="space-y-2">
                              {focusCards.map((item) => (
                                <div key={item.deal.id} className="rounded-xl border bg-card px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold">{item.deal.title}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "rounded-full",
                                            item.deadline.risk === "overdue"
                                              ? "border-rose-200 bg-rose-100 text-rose-800"
                                              : "border-amber-200 bg-amber-100 text-amber-900",
                                          )}
                                        >
                                          {item.deadline.label}
                                        </Badge>
                                        {item.critical ? (
                                          <Badge variant="outline" className="rounded-full border-rose-200 bg-rose-100 text-rose-800">
                                            Crítico
                                          </Badge>
                                        ) : null}
                                        <Badge variant="outline" className="rounded-full">
                                          {item.progress}%
                                        </Badge>
                                      </div>
                                    </div>
                                    <Link href={`/crm?pipeline=${pipeline.id}`} className="shrink-0">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="glass h-9 rounded-xl"
                                        aria-label="Abrir Kanban"
                                      >
                                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                                        <span className="hidden sm:inline">Abrir Kanban</span>
                                        <span className="sm:hidden">Kanban</span>
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Sem cards críticos/vencidos no momento.
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Atividade recente
                          </div>
                          {recentActivities.length ? (
                            <div className="space-y-2">
                              {recentActivities.map((activity) => (
                                <div key={activity.id} className="rounded-xl border bg-card px-3 py-2">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="rounded-full">
                                          {formatActivityType(activity.activityType)}
                                        </Badge>
                                        <div className="truncate text-sm font-semibold">
                                          {activity.dealTitle}
                                        </div>
                                      </div>
                                      <div className="mt-1 text-xs text-muted-foreground">
                                        {activity.actorName} • {formatActivityTime(activity.createdAt)}
                                      </div>
                                      {activity.description ? (
                                        <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                          {activity.description}
                                        </div>
                                      ) : null}
                                    </div>
                                    <Link href={`/crm?pipeline=${pipeline.id}`} className="shrink-0">
                                      <Button type="button" size="sm" variant="ghost" className="h-9 rounded-xl">
                                        Ver
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Nenhuma atividade registrada ainda.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          )}
        </div>
      </div>
    </ModuleGuard>
  )
}
