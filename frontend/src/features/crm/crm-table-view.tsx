"use client"

import { useEffect, useMemo, useState } from "react"
import { Column, ColumnDef, OnChangeFn, SortingState, VisibilityState } from "@tanstack/react-table"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowDown, ArrowUp, ArrowUpDown, LayoutList, Target, User, Calendar, CheckCircle2, DollarSign, ChevronRight } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Deal, Pipeline, resolveDealProgress } from "./use-crm"
import { getDeadlineMeta, getPriorityMeta, getProgressMeta, isCriticalDeal } from "./crm-visuals"
import { DealDetailsModal } from "./deal-details-modal"

import { getUserDisplayName, getUserInitials } from "./crm-utils"
import { useCRMUsers } from "./use-crm-users"
import { motion, AnimatePresence } from "framer-motion"

interface CRMTableViewProps {
  pipeline: Pipeline
  deals: Deal[]
  isLoading: boolean
  sorting: SortingState
  columnVisibility: VisibilityState
  onSortingChange: OnChangeFn<SortingState>
  onColumnVisibilityChange: OnChangeFn<VisibilityState>
}

function getDeadlineSortValue(closingDate?: string) {
  if (!closingDate) return Number.MAX_SAFE_INTEGER
  return new Date(closingDate).getTime()
}

function buildProgressResolver(pipeline: Pipeline) {
  return (deal: Deal) => {
    return resolveDealProgress(deal, pipeline)
  }
}

function SortableHeader<TData>({ column, label }: { column: Column<TData, unknown>; label: string }) {
  const sorted = column.getIsSorted()

  return (
    <Button
      type="button"
      variant="ghost"
      className="h-10 px-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 hover:text-primary transition-colors"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      <div className="ml-2 w-4 flex items-center justify-center">
         {sorted === "asc" && <ArrowUp className="h-3.5 w-3.5 text-primary" />}
         {sorted === "desc" && <ArrowDown className="h-3.5 w-3.5 text-primary" />}
         {!sorted && <ArrowUpDown className="h-3.5 w-3.5 opacity-20" />}
      </div>
    </Button>
  )
}

export function CRMTableView({
  pipeline,
  deals,
  isLoading,
  sorting,
  columnVisibility,
  onSortingChange,
  onColumnVisibilityChange,
}: CRMTableViewProps) {
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)
  const resolveProgress = useMemo(() => buildProgressResolver(pipeline), [pipeline])
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

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

  const { data: users = [] } = useCRMUsers(true)

  const ownerById = useMemo(() => {
    return new Map(users.map((user) => [user.id, user]))
  }, [users])

  const columns = useMemo<ColumnDef<Deal>[]>(
    () => [
      {
        accessorKey: "title",
        header: ({ column }) => <SortableHeader column={column} label="Card Oportunidade" />,
        cell: ({ row }) => {
          const deal = row.original
          const priority = getPriorityMeta(deal.priority)
          const isCritical = isCriticalDeal(deal)

          return (
            <div className="flex flex-col gap-2 py-3 min-w-[320px] group/cell">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "font-black text-[15px] tracking-tight transition-colors group-hover/cell:text-primary", 
                  deal.is_closed ? "text-muted-foreground/40 line-through" : "text-foreground"
                )}>
                  {deal.title}
                </span>
                {isCritical && (
                  <Badge className="bg-rose-500 text-white border-rose-600 text-[8px] h-4 px-1.5 font-black uppercase tracking-widest shadow-lg shadow-rose-500/20">
                    Crítico
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={cn("text-[9px] font-black uppercase tracking-widest h-5 px-2", priority.className)}>
                  {priority.label}
                </Badge>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/60">
                   <Target className="h-3 w-3" />
                   {deal.contact_name}
                </div>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "column_title",
        header: ({ column }) => <SortableHeader column={column} label="Status / Etapa" />,
        cell: ({ row }) => {
          const deal = row.original
          return (
            <div className="flex items-center py-1">
               <Badge className="rounded-xl px-4 h-7 font-black uppercase tracking-widest text-[9px] bg-primary/10 text-primary border-primary/20 shadow-sm">
                 {deal.column_title || "Backlog Geral"}
               </Badge>
            </div>
          )
        },
      },
      {
        accessorKey: "tecnico_responsavel",
        header: ({ column }) => <SortableHeader column={column} label="Orquestrador" />,
        cell: ({ row }) => {
          const deal = row.original
          const owner = ownerById.get(deal.tecnico_responsavel || deal.owner)
          const name = owner ? getUserDisplayName(owner) : "Não atribuído"

          return (
            <div className="flex items-center gap-3 py-1">
              <Avatar className="h-8 w-8 border-2 border-white/5 rounded-xl shadow-lg transition-transform group-hover:scale-110">
                <AvatarFallback className="text-[10px] font-black bg-primary/10 text-primary">
                  {getUserInitials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] font-black uppercase tracking-widest text-foreground/80 truncate max-w-[140px]">
                {name}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: "closing_date",
        header: ({ column }) => <SortableHeader column={column} label="SLA / Prazo" />,
        sortingFn: (rowA, rowB) =>
          getDeadlineSortValue(rowA.original.closing_date) - getDeadlineSortValue(rowB.original.closing_date),
        cell: ({ row }) => {
          const deal = row.original
          const deadline = getDeadlineMeta(deal.closing_date, deal.is_closed)

          return (
            <div className="flex flex-col gap-1 py-1 min-w-[140px]">
              <div className="flex items-center gap-2">
                 <Calendar className="h-3 w-3 text-muted-foreground/40" />
                 <span className="text-xs font-black uppercase tracking-widest">
                   {deal.closing_date
                     ? format(new Date(deal.closing_date), "dd MMM, yyyy", { locale: ptBR })
                     : "Sem Data"}
                 </span>
              </div>
              {deal.closing_date && (
                <div className={cn(
                  "text-[9px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-lg w-fit", 
                  deadline.risk === 'overdue' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-muted/10 text-muted-foreground/40'
                )}>
                  {deadline.label}
                </div>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "progress",
        header: ({ column }) => <SortableHeader column={column} label="Conformidade" />,
        sortingFn: (rowA, rowB) => resolveProgress(rowA.original) - resolveProgress(rowB.original),
        cell: ({ row }) => {
          const deal = row.original
          const progress = resolveProgress(deal)
          const progressMeta = getProgressMeta(progress)

          return (
            <div className="flex flex-col gap-2 min-w-[160px] py-1 pr-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-widest uppercase text-primary">{progress}% <span className="opacity-40">OK</span></span>
                <CheckCircle2 className={cn("h-3 w-3", progress === 100 ? "text-emerald-500" : "text-primary/20")} />
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5 border border-white/5 shadow-inner">
                <div
                  className={cn("h-full transition-all duration-700 ease-out", progressMeta.barClassName)}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "value",
        header: ({ column }) => <SortableHeader column={column} label="Mensuração" />,
        sortingFn: (rowA, rowB) => Number(rowA.original.value) - Number(rowB.original.value),
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2 pr-6 py-1">
             <DollarSign className="h-3 w-3 text-emerald-500 opacity-40" />
             <span className="font-black text-sm tracking-tighter text-emerald-500">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(row.original.value))}
             </span>
          </div>
        ),
      },
      {
        id: "actions",
        cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground/20" />,
      }
    ],
    [ownerById, resolveProgress]
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-1000">
      <div className="rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl relative overflow-hidden group/header">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <LayoutList className="h-32 w-32 rotate-12" />
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <h3 className="text-2xl font-black tracking-tighter uppercase">Tabela Operacional de Alta Precisão</h3>
            <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
              Fluxo Analítico de Oportunidades • <span className="text-primary">{pipeline.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="px-5 py-2 bg-white/5 rounded-2xl border border-white/5 shadow-inner flex flex-col items-end">
                <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Registros Ativos</span>
                <span className="text-xl font-black text-foreground">{deals.length}</span>
             </div>
          </div>
        </div>
      </div>

      <div className="rounded-[3rem] border border-white/10 bg-background/40 backdrop-blur-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.4)] overflow-hidden">
        <DataTable
          columns={columns}
          data={deals}
          isLoading={isLoading}
          onSortingChange={onSortingChange}
          sorting={sorting}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          getRowAriaLabel={(deal) => `Abrir card ${deal.title}`}
          onRowClick={(deal) => {
            setSelectedDeal(deal)
            setDealIdInUrl(deal.id)
          }}
          className="bg-transparent"
        />
      </div>

      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  )
}
