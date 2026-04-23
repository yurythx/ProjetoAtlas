"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowLeft, LayoutGrid } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModuleGuard } from "@/components/module-guard"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

import { getDeadlineMeta, isCriticalDeal } from "./crm-visuals"
import { getDealColumnTitle, getPipelineColumns, isDealInColumn, resolveColumnSemantics, resolveDealProgress, useCRM, type Deal, type Pipeline } from "./use-crm"

type EnrichedCard = { deal: Deal; progress: number; deadline: ReturnType<typeof getDeadlineMeta> }

const EMPTY_COLUMNS: ReturnType<typeof getPipelineColumns> = []
const EMPTY_ENRICHED: EnrichedCard[] = []

function isDealInPipeline(deal: Deal, pipeline: Pipeline) {
  if (deal.column_data?.pipeline) {
    return deal.column_data.pipeline === pipeline.id
  }
  if (deal.stage && Array.isArray(pipeline.stages)) {
    return pipeline.stages.some((stage) => stage.id === deal.stage)
  }
  return false
}

function getDealProgressForPipeline(deal: Deal, pipeline: Pipeline) {
  return resolveDealProgress(deal, pipeline)
}

export function PipelineDetail({ pipelineId }: { pipelineId: number }) {
  const { pipelines, deals, isLoading } = useCRM()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<"all" | "open" | "overdue" | "critical" | "closed">("all")
  const [columnFilterId, setColumnFilterId] = useState<number | "all">("all")

  const pipeline = pipelines.find((item) => item.id === pipelineId)

  const data = useMemo(() => {
    if (!pipeline) return null
    const columns = getPipelineColumns(pipeline)
    const pipelineDeals = deals.filter((deal) => isDealInPipeline(deal, pipeline))
    const enriched = pipelineDeals.map((deal) => {
      const progress = getDealProgressForPipeline(deal, pipeline)
      const deadline = getDeadlineMeta(deal.closing_date, deal.is_closed)
      return {
        deal,
        progress,
        deadline,
      }
    })
    const avg = enriched.length ? Math.round(enriched.reduce((acc, item) => acc + item.progress, 0) / enriched.length) : 0
    const overdue = enriched.filter((item) => !item.deal.is_closed && item.deadline.risk === "overdue").length
    return { columns, enriched, avg, overdue }
  }, [deals, pipeline])

  const columns = data ? data.columns : EMPTY_COLUMNS
  const enriched: EnrichedCard[] = data ? data.enriched : EMPTY_ENRICHED
  const avg = data ? data.avg : 0
  const overdueCount = data ? data.overdue : 0

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return enriched.filter(({ deal, deadline }) => {
      if (normalizedSearch) {
        const matchesTitle = deal.title.toLowerCase().includes(normalizedSearch)
        const matchesContact = deal.contact_name?.toLowerCase().includes(normalizedSearch)
        if (!matchesTitle && !matchesContact) return false
      }

      if (columnFilterId !== "all") {
        const column = columns.find((c) => c.id === columnFilterId)
        if (column && !isDealInColumn(deal, column)) return false
      }

      if (filter === "open") return !deal.is_closed
      if (filter === "closed") return deal.is_closed
      if (filter === "overdue") return !deal.is_closed && deadline.risk === "overdue"
      if (filter === "critical") return isCriticalDeal(deal)
      return true
    })
  }, [columnFilterId, columns, enriched, filter, search])

  const counts = useMemo(() => {
    const all = enriched.length
    const open = enriched.filter((item) => !item.deal.is_closed).length
    const closed = enriched.filter((item) => item.deal.is_closed).length
    const overdue = enriched.filter((item) => !item.deal.is_closed && item.deadline.risk === "overdue").length
    const critical = enriched.filter((item) => isCriticalDeal(item.deal)).length
    return { all, open, closed, overdue, critical }
  }, [enriched])

  if (isLoading) {
    return (
      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="h-6 w-72 rounded bg-muted/30" />
        <div className="mt-4 h-40 rounded-3xl border bg-muted/10" />
      </div>
    )
  }

  if (!pipeline || !data) {
    return (
      <ModuleGuard moduleCode="crm">
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="text-lg font-semibold">Pipeline não encontrado</div>
          <div className="mt-3">
            <Link href="/crm/pipelines">
              <Button variant="outline" className="glass">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </Link>
          </div>
        </div>
      </ModuleGuard>
    )
  }

  const progressClass =
    avg >= 80 ? "bg-emerald-600" : avg >= 45 ? "bg-blue-600" : "bg-amber-600"

  return (
    <ModuleGuard moduleCode="crm">
      <div className="space-y-6">
        <div className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link href="/crm/pipelines" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Pipelines (Visão Geral)
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{pipeline.name}</h1>
                <Badge variant="secondary" className="rounded-full">{enriched.length} card{enriched.length === 1 ? "" : "s"}</Badge>
                <Badge variant="outline" className={cn("rounded-full", overdueCount > 0 && "border-rose-200 bg-rose-100 text-rose-800")}>
                  {overdueCount} vencido{overdueCount === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="mt-3 rounded-2xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progresso médio</div>
                  <div className="text-sm font-bold">{avg}%</div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full transition-all", progressClass)} style={{ width: `${avg}%` }} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Link href={`/crm?pipeline=${pipeline.id}`} className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto">
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Abrir Kanban
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Colunas</div>
            <div className="mt-4 space-y-3">
              {columns.map((column, index) => {
                const colDeals = enriched.filter((item) => isDealInColumn(item.deal, column))
                const avg = colDeals.length ? Math.round(colDeals.reduce((acc, item) => acc + item.progress, 0) / colDeals.length) : 0
                const sem = resolveColumnSemantics(column)
                return (
                  <div key={column.id} className="rounded-2xl border bg-background p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{column.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {colDeals.length} card{colDeals.length === 1 ? "" : "s"} • {avg}% médio
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant="outline" className="rounded-full">{sem.column_kind}</Badge>
                        {sem.marks_done || index === columns.length - 1 ? (
                          <Badge className="rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                            Done
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${avg}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cards</div>
              <Badge variant="secondary" className="rounded-full">{filteredCards.length}</Badge>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar card/cliente..."
                  className="glass w-full md:max-w-[340px]"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                    <SelectTrigger className="glass w-full sm:w-[220px]">
                      <SelectValue placeholder="Filtro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos ({counts.all})</SelectItem>
                      <SelectItem value="open">Abertos ({counts.open})</SelectItem>
                      <SelectItem value="overdue">Vencidos ({counts.overdue})</SelectItem>
                      <SelectItem value="critical">Críticos ({counts.critical})</SelectItem>
                      <SelectItem value="closed">Fechados ({counts.closed})</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={columnFilterId === "all" ? "all" : String(columnFilterId)}
                    onValueChange={(value) => setColumnFilterId(value === "all" ? "all" : Number(value))}
                  >
                    <SelectTrigger className="glass w-full sm:w-[220px]">
                      <SelectValue placeholder="Coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as colunas</SelectItem>
                      {data.columns.map((column) => (
                        <SelectItem key={column.id} value={String(column.id)}>
                          {column.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  className={cn(filter === "all" ? "" : "glass")}
                  size="sm"
                  onClick={() => setFilter("all")}
                >
                  Todos <Badge variant="secondary" className="ml-2 rounded-full">{counts.all}</Badge>
                </Button>
                <Button
                  variant={filter === "open" ? "default" : "outline"}
                  className={cn(filter === "open" ? "" : "glass")}
                  size="sm"
                  onClick={() => setFilter("open")}
                >
                  Abertos <Badge variant="secondary" className="ml-2 rounded-full">{counts.open}</Badge>
                </Button>
                <Button
                  variant={filter === "overdue" ? "default" : "outline"}
                  className={cn(filter === "overdue" ? "" : "glass")}
                  size="sm"
                  onClick={() => setFilter("overdue")}
                >
                  Vencidos <Badge variant="secondary" className="ml-2 rounded-full">{counts.overdue}</Badge>
                </Button>
                <Button
                  variant={filter === "critical" ? "default" : "outline"}
                  className={cn(filter === "critical" ? "" : "glass")}
                  size="sm"
                  onClick={() => setFilter("critical")}
                >
                  Críticos <Badge variant="secondary" className="ml-2 rounded-full">{counts.critical}</Badge>
                </Button>
                <Button
                  variant={filter === "closed" ? "default" : "outline"}
                  className={cn(filter === "closed" ? "" : "glass")}
                  size="sm"
                  onClick={() => setFilter("closed")}
                >
                  Fechados <Badge variant="secondary" className="ml-2 rounded-full">{counts.closed}</Badge>
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {filteredCards
                .slice()
                .sort((a, b) => b.progress - a.progress || a.deal.title.localeCompare(b.deal.title))
                .map(({ deal, progress, deadline }) => {
                  const deadlineClass =
                    deadline.risk === "overdue"
                      ? "border-rose-200 bg-rose-100 text-rose-800"
                      : deadline.risk === "near"
                        ? "border-amber-200 bg-amber-100 text-amber-900"
                        : "border-slate-200 bg-slate-50 text-slate-700"

                  return (
                    <div key={deal.id} className="rounded-2xl border bg-background p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className={cn("truncate font-semibold", deal.is_closed && "text-muted-foreground line-through")}>
                            {deal.title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground truncate">{getDealColumnTitle(deal)}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={cn("rounded-full", deadlineClass)}>{deadline.label}</Badge>
                          <Badge variant="outline" className="rounded-full">{progress}%</Badge>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      </div>
    </ModuleGuard>
  )
}
