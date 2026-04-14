"use client"

import { useEffect, useMemo, useState } from "react"
import { Column, ColumnDef, OnChangeFn, SortingState, VisibilityState } from "@tanstack/react-table"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
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
      className="h-8 px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      onClick={() => column.toggleSorting(sorted === "asc")}
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      {sorted === "asc" && <ArrowUp className="ml-2 h-3.5 w-3.5" />}
      {sorted === "desc" && <ArrowDown className="ml-2 h-3.5 w-3.5" />}
      {!sorted && <ArrowUpDown className="ml-2 h-3.5 w-3.5" />}
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
        header: ({ column }) => <SortableHeader column={column} label="Card / Título" />,
        cell: ({ row }) => {
          const deal = row.original
          const priority = getPriorityMeta(deal.priority)
          const isCritical = isCriticalDeal(deal)

          return (
            <div className="flex flex-col gap-1.5 py-1 min-w-[300px]">
              <div className="flex items-center gap-2">
                <span className={cn("font-bold text-sm", deal.is_closed && "text-muted-foreground line-through")}>
                  {deal.title}
                </span>
                {isCritical && (
                  <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] h-4 px-1 font-bold">
                    CRÍTICO
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px] font-bold h-5", priority.className)}>
                  {priority.label}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {deal.contact_name}
                </span>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "column_title",
        header: ({ column }) => <SortableHeader column={column} label="Coluna" />,
        cell: ({ row }) => {
          const deal = row.original
          return (
            <Badge variant="secondary" className="rounded-full px-3 font-medium">
              {deal.column_title || "Sem coluna"}
            </Badge>
          )
        },
      },
      {
        accessorKey: "tecnico_responsavel",
        header: ({ column }) => <SortableHeader column={column} label="Responsável" />,
        cell: ({ row }) => {
          const deal = row.original
          const owner = ownerById.get(deal.tecnico_responsavel || deal.owner)
          const name = owner ? getUserDisplayName(owner) : "Não atribuído"

          return (
            <div className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7 border">
                <AvatarFallback className="text-[10px] font-bold bg-primary/5 text-primary">
                  {getUserInitials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate max-w-[120px]">
                {name}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: "closing_date",
        header: ({ column }) => <SortableHeader column={column} label="Vencimento" />,
        sortingFn: (rowA, rowB) =>
          getDeadlineSortValue(rowA.original.closing_date) - getDeadlineSortValue(rowB.original.closing_date),
        cell: ({ row }) => {
          const deal = row.original
          const deadline = getDeadlineMeta(deal.closing_date, deal.is_closed)

          return (
            <div className="flex flex-col gap-1 py-1 min-w-[120px]">
              <span className="text-sm font-medium">
                {deal.closing_date
                  ? format(new Date(deal.closing_date), "dd/MM/yyyy", { locale: ptBR })
                  : "—"}
              </span>
              {deal.closing_date && (
                <span className={cn("text-[10px] font-bold uppercase", deadline.risk === 'overdue' ? 'text-rose-600' : 'text-muted-foreground')}>
                  {deadline.label}
                </span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: "progress",
        header: ({ column }) => <SortableHeader column={column} label="Progresso" />,
        sortingFn: (rowA, rowB) => resolveProgress(rowA.original) - resolveProgress(rowB.original),
        cell: ({ row }) => {
          const deal = row.original
          const progress = resolveProgress(deal)
          const progressMeta = getProgressMeta(progress)

          return (
            <div className="flex flex-col gap-2 min-w-[140px] py-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{progress}%</span>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">concluído</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 border border-black/5">
                <div
                  className={cn("h-full transition-all duration-500", progressMeta.barClassName)}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: "value",
        header: ({ column }) => <SortableHeader column={column} label="Valor" />,
        sortingFn: (rowA, rowB) => Number(rowA.original.value) - Number(rowB.original.value),
        cell: ({ row }) => (
          <div className="font-bold text-sm text-right pr-4 text-primary">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(row.original.value))}
          </div>
        ),
      },
    ],
    [ownerById, resolveProgress]
  )

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Tabela Operacional</h3>
              <p className="text-sm text-muted-foreground">
                Visualização detalhada dos cards baseada nos filtros aplicados no Kanban.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3">{pipeline.name}</Badge>
              <Badge variant="secondary" className="rounded-full px-3">{deals.length} card{deals.length === 1 ? "" : "s"}</Badge>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-card shadow-sm">
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
          />
        </div>
      </div>

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
    </>
  )
}
