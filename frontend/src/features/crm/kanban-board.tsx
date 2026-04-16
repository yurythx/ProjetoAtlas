"use client"

import { useCRM, Pipeline, Deal, CRMColumn, getColumnTransitionGuard, getDealColumnId, getPipelineColumns, isDealDone, isDealInColumn, resolveColumnSemantics } from "./use-crm"
import { Card } from "@/components/ui/card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Calendar, Minus, MoreHorizontal, Plus, User } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { DealDetailsModal } from "./deal-details-modal"
import { getDeadlineMeta, getProgressMeta, isCriticalDeal } from "./crm-visuals"
import { toast } from "sonner"
import { QuickTransitionModal } from "./quick-transition-modal"
import { Button } from "@/components/ui/button"
import { DPSMHealthWidget } from "./dpsm-health-widget"
import { DPSMAIAdvisor } from "./dpsm-ai-advisor"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

interface KanbanBoardProps {
  pipeline: Pipeline
  deals: Deal[]
}

export function KanbanBoard({ pipeline, deals }: KanbanBoardProps) {
  const { updateDeal } = useCRM()
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const [transitionState, setTransitionState] = useState<{ deal: Deal; column: CRMColumn } | null>(null)
  const [draggedDealId, setDraggedDealId] = useState<number | null>(null)
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [dropIntent, setDropIntent] = useState<"allowed" | "needs_input" | "blocked" | null>(null)
  const [collapsedColumnIds, setCollapsedColumnIds] = useState<Set<number>>(() => new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [mobileColumnId, setMobileColumnId] = useState<number | null>(null)
  const columns = useMemo(() => getPipelineColumns(pipeline), [pipeline])
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return
    if (typeof window.matchMedia !== "function") {
      setIsMobile(false)
      return
    }
    const media = window.matchMedia("(max-width: 639px)")
    const update = () => setIsMobile(media.matches)
    update()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update)
      return () => media.removeEventListener("change", update)
    }
    media.addListener(update)
    return () => media.removeListener(update)
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`crm-kanban-collapsed:${pipeline.id}`)
      if (!raw) {
        setCollapsedColumnIds(new Set())
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return
      setCollapsedColumnIds(new Set(parsed.filter((value) => typeof value === "number")))
    } catch {}
  }, [pipeline.id])

  useEffect(() => {
    try {
      localStorage.setItem(`crm-kanban-collapsed:${pipeline.id}`, JSON.stringify(Array.from(collapsedColumnIds)))
    } catch {}
  }, [collapsedColumnIds, pipeline.id])

  useEffect(() => {
    if (!columns.length) {
      setMobileColumnId(null)
      return
    }
    setMobileColumnId((current) => {
      if (current && columns.some((column) => column.id === current)) return current
      return columns[0].id
    })
  }, [columns])

  useEffect(() => {
    const raw = searchParams?.get("dealId")
    if (!raw) return
    const dealId = Number(raw)
    if (!Number.isFinite(dealId)) return
    const target = deals.find((d) => d.id === dealId)
    if (target) {
      setSelectedDeal(target)
    }
  }, [deals, searchParams])

  const setDealIdInUrl = (dealId: number | null) => {
    const next = new URLSearchParams(searchParams?.toString() || "")
    if (dealId) {
      next.set("dealId", String(dealId))
    } else {
      next.delete("dealId")
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const toggleColumnCollapsed = (columnId: number) => {
    setCollapsedColumnIds((current) => {
      const next = new Set(current)
      if (next.has(columnId)) {
        next.delete(columnId)
      } else {
        next.add(columnId)
      }
      return next
    })
  }

  const columnSummaryById = useMemo(() => {
    const summaryById = new Map<number, { total: number; overdue: number; averageProgress: number }>()

    const totalColumns = columns.length

    columns.forEach((column, columnIndex) => {
      const stageDeals = deals.filter((deal) => isDealInColumn(deal, column))
      let overdue = 0
      const columnSemantics = resolveColumnSemantics(column)
      const columnProgress =
        totalColumns > 1
          ? columnSemantics.marks_done || columnIndex === totalColumns - 1
            ? 100
            : Math.round((columnIndex / (totalColumns - 1)) * 100)
          : 0

      stageDeals.forEach((deal) => {
        const isCompleted = isDealDone(deal, [pipeline])
        const deadline = getDeadlineMeta(deal.closing_date, isCompleted)
        if (deadline.risk === "overdue") overdue += 1
      })

      summaryById.set(column.id, {
        total: stageDeals.length,
        overdue,
        averageProgress: stageDeals.length ? columnProgress : 0,
      })
    })

    return summaryById
  }, [columns, deals, pipeline])

  const handleDragOver = (e: React.DragEvent, columnId: number) => {
    e.preventDefault()
    setDropTargetId(columnId)

    const dealIdStr = e.dataTransfer.getData("dealId")
    const dealId = Number(dealIdStr) || draggedDealId
    const draggedDeal = deals.find((deal) => deal.id === dealId)
    const targetColumn = columns.find((column) => column.id === columnId)

    if (!dealId || !draggedDeal || !targetColumn) {
      setDropIntent(null)
      return
    }

    if (getDealColumnId(draggedDeal) === targetColumn.id) {
      setDropIntent("allowed")
      return
    }

    const targetColumnSemantics = resolveColumnSemantics(targetColumn)
    const needsDate = targetColumnSemantics.requires_schedule && !draggedDeal.data_agendamento
    const needsTechnician = targetColumnSemantics.requires_assignee && !draggedDeal.tecnico_responsavel
    if (needsDate || needsTechnician) {
      setDropIntent("needs_input")
      return
    }

    const guard = getColumnTransitionGuard(draggedDeal, targetColumn, deals, [pipeline])
    setDropIntent(guard.allowed ? "allowed" : "blocked")
  }

  const handleDragLeave = () => {
    setDropTargetId(null)
    setDropIntent(null)
  }

  const handleDrop = async (e: React.DragEvent, columnId: number) => {
    e.preventDefault()
    setDropTargetId(null)
    setDropIntent(null)

    const dealIdStr = e.dataTransfer.getData("dealId")
    const dealId = parseInt(dealIdStr)
    const draggedDeal = deals.find((deal) => deal.id === dealId)
    const targetColumn = columns.find((column) => column.id === columnId)
    
    if (!dealId || !draggedDeal || !targetColumn) return

    // 1. Verifica se já está na mesma coluna
    if (getDealColumnId(draggedDeal) === targetColumn.id) return

    // 2. Resolve semântica e governança
    const targetColumnSemantics = resolveColumnSemantics(targetColumn)
    const guard = getColumnTransitionGuard(draggedDeal, targetColumn, deals, [pipeline])
    
    // 3. Verifica obrigatoriedades (Data/Técnico)
    const needsDate = targetColumnSemantics.requires_schedule && !draggedDeal.data_agendamento
    const needsTechnician = targetColumnSemantics.requires_assignee && !draggedDeal.tecnico_responsavel

    if (needsDate || needsTechnician) {
      setTransitionState({ deal: draggedDeal, column: targetColumn })
      return
    }

    // 4. Verifica guardas de negócio (ex: WIP limit, transições proibidas)
    if (!guard.allowed) {
      toast.error(guard.reason || "Movimento não permitido para esta coluna.")
      return
    }

    // 5. Executa a transição
    try {
      await updateDeal.mutateAsync({
        id: dealId,
        column: targetColumn.id,
      })
      toast.success(`Card movido para "${targetColumn.title}"`)
    } catch {}
  }

  const orderedColumns = columns

  const renderColumn = (column: CRMColumn, columnIndex: number) => {
    const summary = columnSummaryById.get(column.id) ?? { total: 0, overdue: 0, averageProgress: 0 }
    const semantics = resolveColumnSemantics(column)
    const isCollapsed = collapsedColumnIds.has(column.id)

    return (
      <div
        key={column.id}
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, column.id)}
        data-stage-id={column.legacy_stage ?? column.id}
        data-column-id={column.id}
        className={cn(
          "flex flex-col flex-shrink-0 bg-muted/20 border border-primary/5 rounded-3xl glass group whitespace-normal transition-colors duration-200",
          isMobile
            ? "w-full p-3 gap-4"
            : isCollapsed
              ? "w-[84px] p-2 gap-3"
              : "w-[clamp(260px,25vw,360px)] p-3 sm:p-4 gap-4",
          dropTargetId === column.id && dropIntent === "allowed" && "bg-emerald-500/5 border-emerald-500/30 ring-2 ring-emerald-500/10",
          dropTargetId === column.id && dropIntent === "needs_input" && "bg-amber-500/10 border-amber-500/30 ring-2 ring-amber-500/10",
          dropTargetId === column.id && dropIntent === "blocked" && "bg-rose-500/10 border-rose-500/30 ring-2 ring-rose-500/10",
          dropTargetId === column.id && !dropIntent && "bg-primary/5 border-primary/20 ring-2 ring-primary/10"
        )}
      >
        <div className={cn("space-y-2", isCollapsed && !isMobile ? "px-0" : "px-2 mb-2")}>
          <div className={cn("flex items-start justify-between gap-2", isCollapsed && !isMobile && "flex-col items-center")}>
            <div className={cn("flex items-center gap-2 min-w-0", isCollapsed && !isMobile && "flex-col gap-2")}>
              <h3
                className={cn(
                  "font-semibold text-sm uppercase tracking-wider truncate",
                  isCollapsed && !isMobile && "text-[13px] font-extrabold tracking-[0.32em] [writing-mode:vertical-rl] rotate-180 text-center whitespace-nowrap"
                )}
                title={column.title}
              >
                {column.title}
              </h3>
              <Badge
                variant="outline"
                className={cn("rounded-full px-2 py-0 h-5 bg-card/50", isCollapsed && !isMobile && "h-7 w-7 p-0 justify-center")}
              >
                {summary.total}
              </Badge>
            </div>

            <div className={cn("flex items-center gap-2", isCollapsed && !isMobile && "flex-col")}>
              {!isMobile ? (
                <Button
                  variant="outline"
                  size="icon-xs"
                  className="glass"
                  onClick={() => toggleColumnCollapsed(column.id)}
                >
                  {isCollapsed ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                </Button>
              ) : null}
              {!isCollapsed || isMobile ? (
                <MoreHorizontal className="h-4 w-4 opacity-0 group-hover:opacity-100 cursor-pointer" />
              ) : null}
            </div>
          </div>

          {!isCollapsed || isMobile ? (
            <div className="flex flex-wrap items-center gap-2">
              {semantics.wip_limit ? (
                <Badge
                  variant="outline"
                  className={summary.total >= semantics.wip_limit ? "border-amber-300 bg-amber-50 text-amber-800" : ""}
                >
                  WIP {summary.total}/{semantics.wip_limit}
                </Badge>
              ) : null}
              <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${summary.averageProgress}%` }} />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">{summary.averageProgress}%</span>

              {summary.overdue > 0 && (
                <Badge className="bg-rose-100 text-rose-800 border-rose-200">
                  {summary.overdue} vencido{summary.overdue === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          ) : null}
        </div>

        <div className={cn("flex flex-col gap-3", isCollapsed && !isMobile && "hidden")}>
          {deals
            .filter((deal) => isDealInColumn(deal, column))
            .sort((a, b) => {
              const priorityWeight = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
              const diff = priorityWeight[b.priority] - priorityWeight[a.priority]
              if (diff !== 0) return diff
              if (!a.closing_date && !b.closing_date) return 0
              if (!a.closing_date) return 1
              if (!b.closing_date) return -1
              return new Date(a.closing_date).getTime() - new Date(b.closing_date).getTime()
            })
            .map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                column={column}
                columnIndex={columnIndex}
                totalColumns={columns.length}
                onDragStart={(dealId) => setDraggedDealId(dealId)}
                onDragEnd={() => {
                  setDraggedDealId(null)
                  setDropTargetId(null)
                  setDropIntent(null)
                }}
                onClick={() => {
                  setSelectedDeal(deal)
                  setDealIdInUrl(deal.id)
                }}
              />
            ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{pipeline.name}</h2>
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Fluxo de Valor Digital (DPSM)</p>
        </div>
        <DPSMAIAdvisor />
      </div>
      <DPSMHealthWidget />
      {isMobile ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1 overflow-x-auto no-scrollbar pb-2">
            {orderedColumns.map((column) => (
              <Button
                key={column.id}
                variant="ghost"
                size="sm"
                onClick={() => setMobileColumnId(column.id)}
                className={cn(
                  "rounded-full px-4 h-8 text-[10px] font-bold uppercase tracking-widest transition-all shrink-0",
                  mobileColumnId === column.id 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                {column.title}
              </Button>
            ))}
          </div>

          <div className="relative touch-pan-y min-h-[60vh]">
            <AnimatePresence mode="wait">
              <motion.div
                key={mobileColumnId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-full"
              >
                {mobileColumnId ? renderColumn(orderedColumns.find((c) => c.id === mobileColumnId) || orderedColumns[0], 0) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <ScrollArea className="w-full whitespace-nowrap pb-6">
          <div className="flex gap-4 sm:gap-6 min-h-[560px] sm:min-h-[700px] p-1 w-max">
            <AnimatePresence mode="popLayout">
              {orderedColumns.map((column, columnIndex) => renderColumn(column, columnIndex))}
            </AnimatePresence>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {selectedDeal && (
        <DealDetailsModal
          deal={selectedDeal}
          open={!!selectedDeal}
          onOpenChange={(open) => {
            if (open) return
            setSelectedDeal(null)
            setDealIdInUrl(null)
          }}
        />
      )}

      <QuickTransitionModal
        open={!!transitionState}
        onOpenChange={(open) => !open && setTransitionState(null)}
        deal={transitionState?.deal || null}
        targetColumn={transitionState?.column || null}
      />
    </>
  )
}

function DealCard({
  deal,
  column,
  columnIndex,
  totalColumns,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  deal: Deal
  column: CRMColumn
  columnIndex: number
  totalColumns: number
  onDragStart?: (dealId: number) => void
  onDragEnd?: () => void
  onClick?: () => void
}) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("dealId", deal.id.toString())
    onDragStart?.(deal.id)
  }

  const priorityColors = {
    LOW: "bg-green-500/10 text-green-600 border-green-500/20",
    MEDIUM: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    HIGH: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    URGENT: "bg-red-500/10 text-red-600 border-red-500/20 shadow-sm shadow-red-500/5",
  }

  const isCompleted = isDealDone(deal)
  const deadlineMeta = getDeadlineMeta(deal.closing_date, isCompleted)
  const isCritical = isCriticalDeal(deal)
  const semantics = resolveColumnSemantics(deal.column_data || { title: deal.column_title })
  const columnSemantics = resolveColumnSemantics(column)

  const progress = useMemo(() => {
    if (totalColumns <= 1) return 0
    if (columnSemantics.marks_done || columnIndex === totalColumns - 1) return 100
    return Math.round((columnIndex / (totalColumns - 1)) * 100)
  }, [columnIndex, columnSemantics.marks_done, totalColumns])

  const progressMeta = getProgressMeta(progress)

  // Define o badge de status baseado no tipo da coluna
  const statusBadge = useMemo(() => {
    switch (semantics.column_kind) {
      case "backlog":
        return { label: "Novo", className: "bg-emerald-600 text-white border-emerald-700" }
      case "planned":
        return { label: "Planejado", className: "bg-violet-100 text-violet-700 border-violet-200" }
      case "active":
        return { label: "Em Andamento", className: "bg-blue-100 text-blue-700 border-blue-200" }
      case "done":
        return { label: "Finalizado", className: "bg-black text-white border-black" }
      case "discover":
        return { label: "Descoberta", className: "bg-cyan-100 text-cyan-800 border-cyan-200" }
      case "design":
        return { label: "Design", className: "bg-indigo-100 text-indigo-800 border-indigo-200" }
      case "acquire":
        return { label: "Aquisição", className: "bg-amber-100 text-amber-800 border-amber-200" }
      case "build":
        return { label: "Construção", className: "bg-sky-100 text-sky-800 border-sky-200" }
      case "transition":
        return { label: "Transição", className: "bg-teal-100 text-teal-800 border-teal-200" }
      case "operate":
        return { label: "Operação", className: "bg-emerald-100 text-emerald-800 border-emerald-200" }
      case "deliver":
        return { label: "Entrega", className: "bg-green-100 text-green-800 border-green-200" }
      case "support":
        return { label: "Suporte", className: "bg-rose-100 text-rose-800 border-rose-200" }
      default:
        return null
    }
  }, [semantics.column_kind])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, rotate: 0.5 }}
      className={`cursor-move ${isCompleted ? 'opacity-70' : ''}`}
    >
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        data-deal-id={deal.id}
      >
        <Card
          className={cn(
            "p-4 shadow-sm hover:shadow-xl transition-all border-primary/5 hover:border-primary/20 group relative overflow-hidden glass-card",
            isCompleted && "bg-slate-50/50",
            isCritical && "border-rose-300 bg-rose-50/40 shadow-lg shadow-rose-500/10"
          )}
        >
          {/* Prioridade em destaque lateral */}
          <div className={`absolute top-0 left-0 w-1 h-full ${
              deal.priority === 'URGENT' ? 'bg-red-500' : 
              deal.priority === 'HIGH' ? 'bg-orange-500' :
              deal.priority === 'MEDIUM' ? 'bg-blue-500' : 'bg-green-500'
          }`} />

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  {statusBadge && (
                    <Badge variant="outline" className={cn("w-fit text-[9px] font-black px-1.5 h-4 tracking-wider", statusBadge.className)}>
                      {statusBadge.label}
                    </Badge>
                  )}
                  {/* AI Suggestion Indicator */}
                  {deal.priority === "URGENT" || isCritical ? (
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="flex items-center gap-1 bg-violet-600 text-white text-[8px] px-1.5 h-4 rounded-full font-black uppercase tracking-tighter shadow-sm"
                    >
                      <span className="animate-pulse">✨ AI Insight</span>
                    </motion.div>
                  ) : null}
                </div>
                {deal.record_type && (
                  <Badge variant="secondary" className="w-fit text-[8px] px-1.5 h-3.5 uppercase font-bold bg-slate-100 text-slate-600 border-slate-200">
                    {deal.record_type === 'service_request' ? 'Requisição' : 
                     deal.record_type === 'incident' ? 'Incidente' :
                     deal.record_type === 'problem' ? 'Problema' :
                     deal.record_type === 'change' ? 'Mudança' : 'Oportunidade'}
                  </Badge>
                )}
                <h4 className={`font-bold text-[15px] leading-tight line-clamp-2 ${isCompleted ? 'text-muted-foreground' : ''}`}>
                  {deal.title}
                </h4>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={`text-[10px] uppercase font-bold shrink-0 ${priorityColors[deal.priority]}`}>
                  {deal.priority}
                </Badge>
                {isCritical && (
                  <Badge className="text-[10px] uppercase font-bold shrink-0 border-rose-300 bg-rose-100 text-rose-800">
                    Crítico
                  </Badge>
                )}
                {/* Sentiment (XLA) - ITIL v5 Focus */}
                <div className="flex items-center gap-1 mt-1 bg-muted/50 px-1.5 py-0.5 rounded-full border border-primary/5">
                  <span className="text-[12px]">
                    {deal.xla_score && deal.xla_score >= 8 ? "😊" : deal.xla_score && deal.xla_score >= 5 ? "😐" : "😟"}
                  </span>
                  <span className="text-[10px] font-black text-muted-foreground">XLA</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium truncate">
                 <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center border border-primary/10 shrink-0">
                   <User className="h-3.5 w-3.5 text-primary" />
                 </div>
                 <span className="truncate">{deal.contact_name}</span>
              </div>
              <Badge variant="outline" className={cn("text-[10px] font-bold px-1.5 h-5", progressMeta.badgeClassName)}>
                {progress}%
              </Badge>
            </div>

            <div className="flex items-center justify-between pt-1">
              {deal.closing_date && (
                <div className={cn("flex items-center gap-2 text-[11px] font-bold py-1 px-2 rounded-lg", deadlineMeta.pillClassName)}>
                   <Calendar className="h-3 w-3" />
                   {format(new Date(deal.closing_date), "dd 'de' MMM", { locale: ptBR })}
                </div>
              )}
              
              <div className="flex items-center gap-2 ml-auto">
                {deadlineMeta.risk === "overdue" && (
                  <div className="flex items-center gap-1 text-[11px] font-bold text-rose-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Vencido
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Barra de progresso sutil na base do card */}
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-100">
            <div
              className={cn("h-full transition-all duration-500", progressMeta.barClassName)}
              style={{ width: `${progress}%` }}
            />
          </div>
        </Card>
      </div>
    </motion.div>
  )
}
