"use client"

import { useMemo } from "react"

import { Badge } from "@/components/ui/badge"
import { getDealColumnId, getPipelineColumns, isDealDone, isDealInColumn, resolveDealProgress, type Deal, type Pipeline } from "./use-crm"
import { getDeadlineMeta } from "./crm-visuals"

interface CRMPipelineOverviewProps {
  pipeline: Pipeline
  deals: Deal[]
  overview?: PipelineOverviewData
  isLoading?: boolean
}

export interface PipelineOverviewData {
  pipeline_id: number
  pipeline_name: string
  summary: {
    total_deals: number
    total_value: string
    overdue: number
    at_risk: number
    done: number
    average_progress: number
  }
  stages?: Array<{
    stage_id?: number
    column_id?: number
    column_title?: string
    name: string
    total_deals: number
    overdue: number
    average_progress: number
  }>
  columns?: Array<{
    stage_id?: number
    column_id?: number
    column_title?: string
    name: string
    total_deals: number
    overdue: number
    average_progress: number
  }>
}

type PipelineOverviewColumnMetric = {
  stage_id?: number
  column_id?: number
  column_title?: string
  name: string
  total_deals: number
  overdue: number
  average_progress: number
}

function getOverviewColumns(overview: PipelineOverviewData): PipelineOverviewColumnMetric[] {
  if (overview.columns && overview.columns.length > 0) {
    return overview.columns
  }

  return (overview.stages || []).map((stage) => ({
    ...stage,
    column_id: stage.column_id ?? stage.stage_id,
    column_title: stage.column_title ?? stage.name,
  }))
}

function getDeadlineRisk(deal: Deal) {
  const deadline = getDeadlineMeta(deal.closing_date, isDealDone(deal))
  if (deadline.risk === "today" || deadline.risk === "near") return "risk" as const
  return deadline.risk
}

export function CRMPipelineOverview({ pipeline, deals, overview, isLoading = false }: CRMPipelineOverviewProps) {
  const pipelineColumns = useMemo(() => getPipelineColumns(pipeline), [pipeline])
  const stageIds = useMemo(() => new Set(pipeline.stages.map((stage) => stage.id)), [pipeline.stages])
  const columnIds = useMemo(() => new Set(pipelineColumns.map((column) => column.id)), [pipelineColumns])
  const pipelineDeals = useMemo(() => {
    return deals.filter((deal) => {
      const columnId = getDealColumnId(deal)
      if (typeof columnId === "number" && columnIds.has(columnId)) return true
      if (typeof deal.stage === "number" && stageIds.has(deal.stage)) return true
      return false
    })
  }, [columnIds, deals, stageIds])

  const localOverview = useMemo(
    () => {
      const summary = pipelineDeals.reduce(
        (acc, deal) => {
          const risk = getDeadlineRisk(deal)
          const progress = resolveDealProgress(deal, pipeline)

          acc.total += 1
          acc.totalValue += Number(deal.value || 0)
          acc.averageProgress += progress

          if (risk === "overdue") acc.overdue += 1
          if (risk === "risk") acc.atRisk += 1
          if (isDealDone(deal)) acc.done += 1

          return acc
        },
        { total: 0, totalValue: 0, overdue: 0, atRisk: 0, done: 0, averageProgress: 0 }
      )

      const averageProgress = summary.total > 0 ? Math.round(summary.averageProgress / summary.total) : 0
      const totalValue = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(summary.totalValue)

      return {
        summary: {
          total_deals: summary.total,
          total_value: totalValue,
          overdue: summary.overdue,
          at_risk: summary.atRisk,
          done: summary.done,
          average_progress: averageProgress,
        },
        columns: pipelineColumns.map((column) => {
          const stageDeals = pipelineDeals.filter((deal) => isDealInColumn(deal, column))
          const stageAverage =
            stageDeals.length > 0
              ? Math.round(stageDeals.reduce((sum, deal) => sum + resolveDealProgress(deal, pipeline), 0) / stageDeals.length)
              : 0
          const stageOverdue = stageDeals.filter((deal) => getDeadlineRisk(deal) === "overdue").length

          return {
            stage_id: column.legacy_stage || column.id,
            column_id: column.id,
            column_title: column.title,
            name: column.title,
            total_deals: stageDeals.length,
            overdue: stageOverdue,
            average_progress: stageAverage,
          }
        }),
      }
    },
    [pipeline, pipelineColumns, pipelineDeals]
  )
  const resolvedOverview = overview
    ? {
        summary: {
          ...overview.summary,
          total_value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(overview.summary.total_value)),
        },
        columns: getOverviewColumns(overview),
      }
    : localOverview

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resumo do pipeline</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Panorama geral para priorizar cards, risco de prazo e entrega do fluxo atual.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{pipeline.name}</Badge>
            <Badge variant="secondary">
              {resolvedOverview.summary.total_deals} card{resolvedOverview.summary.total_deals === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cards</p>
            <div className="mt-2 text-2xl font-semibold">{isLoading ? "..." : resolvedOverview.summary.total_deals}</div>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Valor total</p>
            <div className="mt-2 text-2xl font-semibold text-primary">{isLoading ? "..." : resolvedOverview.summary.total_value}</div>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Vencidos</p>
            <div className="mt-2 text-2xl font-semibold text-rose-700">{isLoading ? "..." : resolvedOverview.summary.overdue}</div>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Em risco</p>
            <div className="mt-2 text-2xl font-semibold text-amber-700">{isLoading ? "..." : resolvedOverview.summary.at_risk}</div>
          </div>
          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Progresso médio</p>
            <div className="mt-2 text-2xl font-semibold text-emerald-700">
              {isLoading ? "..." : `${resolvedOverview.summary.average_progress}%`}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Colunas do fluxo</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Veja volume, progresso médio e risco por coluna.
        </p>

        <div className="mt-5 space-y-3">
          {resolvedOverview.columns.map((column) => {
            return (
              <div key={column.column_id ?? column.stage_id ?? column.name} className="rounded-2xl border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{column.column_title || column.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {isLoading ? "..." : `${column.total_deals} card${column.total_deals === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{isLoading ? "..." : `${column.average_progress}%`}</div>
                    <div className="text-xs text-muted-foreground">progresso médio</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${column.average_progress}%` }} />
                  </div>
                  {column.overdue > 0 && (
                    <Badge className="border-rose-200 bg-rose-100 text-rose-800">
                      {column.overdue} vencido{column.overdue === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
