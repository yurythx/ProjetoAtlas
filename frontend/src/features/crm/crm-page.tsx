"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import type { OnChangeFn, SortingState, VisibilityState } from "@tanstack/react-table"
import { 
  isBefore, 
  isAfter, 
  startOfDay, 
  endOfDay, 
  endOfWeek, 
  endOfMonth,
} from "date-fns"
import { PageHeader } from "@/components/ui/page-header"
import { ModuleGuard } from "@/components/module-guard"
import { CRMSavedView, CRMViewMode, getPipelineColumns, useCRM, CRMSavedViewFilters, useSLAMonitor } from "./use-crm"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import { KanbanSkeleton } from "./kanban-skeleton"

const KanbanBoard = dynamic(() => import("./kanban-board").then(m => m.KanbanBoard), { 
  ssr: false, 
  loading: () => <KanbanSkeleton />
})

import { CreateDealModal } from "./create-deal-modal"
import { ColumnGovernanceSheet } from "./column-governance-sheet"
import { CRMTableView } from "./crm-table-view"
import { CRMTriageInbox } from "./crm-triage-inbox"
import { CRMPipelineOverview, PipelineOverviewData } from "./crm-pipeline-overview"
import { PipelineManagerModal } from "./pipeline-manager-modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { BarChart3, BookOpen, ChevronDown, ChevronUp, Inbox, LayoutGrid, List, Loader2, PanelsTopLeft, Search, TrendingUp } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { api } from "@/lib/axios"
import { toast } from "sonner"
import { getUserDisplayName } from "./crm-utils"
import { useCRMUsers } from "./use-crm-users"
import { usePermission } from "@/hooks/use-permission"

const DEFAULT_CRM_FILTERS: CRMSavedViewFilters = {
  stageFilter: "all",
  priorityFilter: "all",
  ownerFilter: "all",
  titleSearch: "",
  dueFilter: "all",
}

function normalizeSavedViewSorting(sorting: CRMSavedView["sorting"] | undefined): SortingState {
  if (!Array.isArray(sorting)) return []
  return sorting
    .filter((item): item is { id: string; desc: boolean } => typeof item?.id === "string")
    .map((item) => ({ id: item.id, desc: Boolean(item.desc) }))
}

function normalizeSavedViewVisibility(columnVisibility: CRMSavedView["column_visibility"] | undefined): VisibilityState {
  if (!columnVisibility || typeof columnVisibility !== "object" || Array.isArray(columnVisibility)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(columnVisibility).map(([key, value]) => [key, Boolean(value)])
  )
}

function normalizeSavedViewsResponse(data: CRMSavedView[] | { results?: CRMSavedView[] } | undefined) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

function isCRMViewMode(value: unknown): value is CRMViewMode {
  return value === "kanban" || value === "list"
}

export default function CRMPage() {
  const { pipelines, deals, isLoading } = useCRM()
  useSLAMonitor()
  const queryClient = useQueryClient()
  const { hasPermission } = usePermission()
  const canManagePipelines = hasPermission("crm.pipeline_manage")
  const canDealEdit = hasPermission("crm.deal_edit")
  const searchParams = useSearchParams()
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null)
  const [view, setView] = useState<CRMViewMode>("kanban")
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<number | null>(null)
  const [savedViewName, setSavedViewName] = useState("")
  const [stageFilter, setStageFilter] = useState(DEFAULT_CRM_FILTERS.stageFilter)
  const [priorityFilter, setPriorityFilter] = useState<CRMSavedViewFilters["priorityFilter"]>(DEFAULT_CRM_FILTERS.priorityFilter)
  const [ownerFilter, setOwnerFilter] = useState(DEFAULT_CRM_FILTERS.ownerFilter)
  const [titleSearch, setTitleSearch] = useState(DEFAULT_CRM_FILTERS.titleSearch)
  const [dueFilter, setDueFilter] = useState<CRMSavedViewFilters["dueFilter"]>(DEFAULT_CRM_FILTERS.dueFilter)
  const [controlsOpen, setControlsOpen] = useState(false)
  const { data: users = [] } = useCRMUsers(controlsOpen)

  // Seleciona o primeiro pipeline por padrção
  const currentPipeline = selectedPipelineId 
    ? pipelines.find(p => p.id === selectedPipelineId) 
    : pipelines[0]

  const currentColumns = useMemo(() => {
    if (!currentPipeline) return []
    return getPipelineColumns(currentPipeline)
  }, [currentPipeline])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("crm-controls-open")
      if (raw === "1") {
        setControlsOpen(true)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem("crm-controls-open", controlsOpen ? "1" : "0")
    } catch {}
  }, [controlsOpen])

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (titleSearch.trim()) count += 1
    if (stageFilter !== "all") count += 1
    if (priorityFilter !== "all") count += 1
    if (ownerFilter !== "all") count += 1
    if (dueFilter !== "all") count += 1
    return count
  }, [titleSearch, stageFilter, priorityFilter, ownerFilter, dueFilter])

  const [showTriage, setShowTriage] = useState(false)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    const fromUrl = searchParams.get("pipeline")
    if (!fromUrl) return
    const numericId = Number(fromUrl)
    if (!Number.isFinite(numericId)) return
    setSelectedPipelineId(numericId)
  }, [searchParams])
  const [tableSorting, setTableSorting] = useState<SortingState>([])
  const [tableColumnVisibility, setTableColumnVisibility] = useState<VisibilityState>({})
  const isRestoringUiStateRef = useRef(false)

  useEffect(() => {
    if (!currentPipeline?.id) return
    const storageKey = `crm-ui-state:${currentPipeline.id}`
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object") return
      const value = parsed as Record<string, unknown>
      if (value["version"] !== 1) return

      isRestoringUiStateRef.current = true

      const viewMode = value["view"]
      if (isCRMViewMode(viewMode)) {
        setView(viewMode)
      }

      const filters = value["filters"]
      if (filters && typeof filters === "object") {
        const f = filters as Record<string, unknown>
        if (typeof f["stageFilter"] === "string") setStageFilter(f["stageFilter"])
        if (typeof f["priorityFilter"] === "string") setPriorityFilter(f["priorityFilter"] as CRMSavedViewFilters["priorityFilter"])
        if (typeof f["ownerFilter"] === "string") setOwnerFilter(f["ownerFilter"])
        if (typeof f["titleSearch"] === "string") setTitleSearch(f["titleSearch"])
        if (typeof f["dueFilter"] === "string") setDueFilter(f["dueFilter"] as CRMSavedViewFilters["dueFilter"])
      }

      const sorting = value["tableSorting"]
      if (Array.isArray(sorting)) setTableSorting(sorting as SortingState)

      const visibility = value["tableColumnVisibility"]
      if (visibility && typeof visibility === "object") setTableColumnVisibility(visibility as VisibilityState)

      const savedViewId = value["selectedSavedViewId"]
      if (typeof savedViewId === "number") setSelectedSavedViewId(savedViewId)
      if (typeof value["savedViewName"] === "string") setSavedViewName(value["savedViewName"])

      const controls = value["controlsOpen"]
      if (typeof controls === "boolean") setControlsOpen(controls)
    } catch {
    } finally {
      queueMicrotask(() => {
        isRestoringUiStateRef.current = false
      })
    }
  }, [currentPipeline?.id])

  useEffect(() => {
    if (!currentPipeline?.id) return
    if (isRestoringUiStateRef.current) return
    const storageKey = `crm-ui-state:${currentPipeline.id}`
    const payload = {
      version: 1,
      view,
      filters: {
        stageFilter,
        priorityFilter,
        ownerFilter,
        titleSearch,
        dueFilter,
      },
      tableSorting,
      tableColumnVisibility,
      selectedSavedViewId,
      savedViewName,
      controlsOpen,
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {}
  }, [
    currentPipeline?.id,
    view,
    stageFilter,
    priorityFilter,
    ownerFilter,
    titleSearch,
    dueFilter,
    tableSorting,
    tableColumnVisibility,
    selectedSavedViewId,
    savedViewName,
    controlsOpen,
  ])

  // Filtros de busca e estado
  const pipelineScopedDeals = useMemo(() => {
    if (!currentPipeline) return deals
    return deals.filter((deal) => {
      if (deal.column_data?.pipeline) {
        return deal.column_data.pipeline === currentPipeline.id
      }
      if (deal.stage) {
        return currentPipeline.stages.some((stage) => stage.id === deal.stage)
      }
      return false
    })
  }, [currentPipeline, deals])

  const filteredDeals = useMemo(() => {
    const selectedStageId = stageFilter !== "all" ? Number(stageFilter) : null

    return pipelineScopedDeals.filter(deal => {
      // 0.5 Filtro por Coluna/Stage (se aplicavel)
      if (selectedStageId) {
        const matchesColumn = deal.column_data?.id === selectedStageId || deal.column === selectedStageId || deal.column_id === selectedStageId
        if (matchesColumn) {
          // ok
        } else {
          const targetColumn = currentColumns.find((c) => c.id === selectedStageId)
          const matchesLegacy = targetColumn?.legacy_stage && deal.stage === targetColumn.legacy_stage
          if (!matchesLegacy) return false
        }
      }

      // 1. Busca por Titulo
      if (titleSearch && !deal.title.toLowerCase().includes(titleSearch.toLowerCase())) {
        return false
      }

      // 2. Filtro de Prioridade (Urgencia)
      if (priorityFilter !== "all" && deal.priority !== priorityFilter) {
        return false
      }

      // 3. Filtro de Responsavel
      if (ownerFilter !== "all" && deal.owner.toString() !== ownerFilter) {
        return false
      }

      // 4. Filtro de Data de Vencimento
      if (dueFilter !== "all") {
        if (!deal.closing_date) return false
        
        const closingDate = new Date(deal.closing_date)
        const now = new Date()

        if (dueFilter === "overdue") {
          if (!isBefore(closingDate, startOfDay(now)) || deal.is_closed) return false
        } else if (dueFilter === "today") {
          if (!isAfter(closingDate, startOfDay(now)) || !isBefore(closingDate, endOfDay(now))) return false
        } else if (dueFilter === "this_week") {
          const weekEnd = endOfWeek(now, { weekStartsOn: 0 })
          if (!isAfter(closingDate, startOfDay(now)) || !isBefore(closingDate, weekEnd)) return false
        } else if (dueFilter === "this_month") {
          const monthEnd = endOfMonth(now)
          if (!isAfter(closingDate, startOfDay(now)) || !isBefore(closingDate, monthEnd)) return false
        }
      }

      return true
    })
  }, [pipelineScopedDeals, titleSearch, priorityFilter, ownerFilter, dueFilter, stageFilter, currentColumns])

  const ownerOptions = useMemo(() => {
    const relevantOwnerIds = new Set(pipelineScopedDeals.map((deal) => deal.owner))
    return users
      .filter((user) => relevantOwnerIds.has(user.id))
      .slice()
      .sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)))
  }, [pipelineScopedDeals, users])

  const resetViewState = () => {
    setView("kanban")
    setStageFilter(DEFAULT_CRM_FILTERS.stageFilter)
    setPriorityFilter(DEFAULT_CRM_FILTERS.priorityFilter)
    setOwnerFilter(DEFAULT_CRM_FILTERS.ownerFilter)
    setTitleSearch(DEFAULT_CRM_FILTERS.titleSearch)
    setDueFilter(DEFAULT_CRM_FILTERS.dueFilter)
    setTableSorting([])
    setTableColumnVisibility({})
  }

  const applySavedView = (savedView: CRMSavedView) => {
    setSelectedSavedViewId(savedView.id)
    setSavedViewName(savedView.name)
    setView(savedView.view_mode)
    setStageFilter(savedView.filters?.stageFilter || DEFAULT_CRM_FILTERS.stageFilter)
    setPriorityFilter((savedView.filters?.priorityFilter as CRMSavedViewFilters["priorityFilter"]) || DEFAULT_CRM_FILTERS.priorityFilter)
    setOwnerFilter(savedView.filters?.ownerFilter || DEFAULT_CRM_FILTERS.ownerFilter)
    setTitleSearch(savedView.filters?.titleSearch || DEFAULT_CRM_FILTERS.titleSearch)
    setDueFilter((savedView.filters?.dueFilter as CRMSavedViewFilters["dueFilter"]) || DEFAULT_CRM_FILTERS.dueFilter)
    setTableSorting(normalizeSavedViewSorting(savedView.sorting))
    setTableColumnVisibility(normalizeSavedViewVisibility(savedView.column_visibility))
  }

  const buildSavedViewPayload = (name: string) => ({
    pipeline: currentPipeline?.id,
    name,
    view_mode: view,
    filters: {
      stageFilter,
      priorityFilter,
      ownerFilter,
      titleSearch,
      dueFilter,
    },
    sorting: tableSorting,
    column_visibility: tableColumnVisibility,
  })

  const { data: pipelineOverview, isLoading: isLoadingOverview } = useQuery({
    queryKey: ["crm-pipeline-overview", currentPipeline?.id],
    enabled: Boolean(currentPipeline?.id),
    queryFn: async () => {
      const response = await api.get<PipelineOverviewData>(`/api/crm/pipelines/${currentPipeline?.id}/overview/`)
      return response.data
    },
  })

  const { data: savedViews = [], isLoading: isLoadingSavedViews } = useQuery({
    queryKey: ["crm-saved-views", currentPipeline?.id],
    enabled: Boolean(currentPipeline?.id),
    queryFn: async () => {
      const response = await api.get<CRMSavedView[] | { results?: CRMSavedView[] }>(`/api/crm/saved-views/?pipeline_id=${currentPipeline?.id}`)
      return normalizeSavedViewsResponse(response.data)
    },
  })

  useEffect(() => {
    // Se nao temos pipeline, resetamos o estado apenas se houver algo selecionado
    if (!currentPipeline?.id) {
      if (selectedSavedViewId !== null || savedViewName !== "") {
        setSelectedSavedViewId(null)
        setSavedViewName("")
        resetViewState()
      }
      return
    }

    // Se temos um pipeline e uma vista selecionada, verificamos se ela ainda e valida
    const currentSelected = savedViews.find((item) => item.id === selectedSavedViewId)
    if (currentSelected) {
      if (savedViewName !== currentSelected.name) {
        setSavedViewName(currentSelected.name)
      }
      return
    }

    // Se nao temos vista selecionada, tentamos aplicar a padrão do pipeline
    const defaultSavedView = savedViews.find((item) => item.is_default)
    if (defaultSavedView && !selectedSavedViewId) {
      applySavedView(defaultSavedView)
      return
    }

    // Se nao houver vista padrão e houver algo selecionado que nao existe mais, limpamos
    if (selectedSavedViewId !== null || savedViewName !== "") {
      setSelectedSavedViewId(null)
      setSavedViewName("")
      resetViewState()
    }
  }, [currentPipeline?.id, savedViews, selectedSavedViewId, savedViewName])

  const createSavedView = useMutation({
    mutationFn: async () => {
      if (!currentPipeline?.id || !savedViewName.trim()) {
        throw new Error("Defina um nome para salvar a vista.")
      }

      const response = await api.post<CRMSavedView>("/api/crm/saved-views/", buildSavedViewPayload(savedViewName.trim()))
      return response.data
    },
    onSuccess: (savedView) => {
      queryClient.invalidateQueries({ queryKey: ["crm-saved-views", currentPipeline?.id] })
      applySavedView(savedView)
      toast.success("Vista salva com sucesso!")
    },
    onError: () => {
      toast.error("Nção foi possível salvar a vista.")
    },
  })

  const updateSavedView = useMutation({
    mutationFn: async (extraPayload?: Partial<CRMSavedView>) => {
      if (!selectedSavedViewId || !savedViewName.trim()) {
        throw new Error("Selecione uma vista salva para atualizar.")
      }

      const response = await api.patch<CRMSavedView>(
        `/api/crm/saved-views/${selectedSavedViewId}/`,
        {
          ...buildSavedViewPayload(savedViewName.trim()),
          ...extraPayload,
        }
      )
      return response.data
    },
    onSuccess: (savedView) => {
      queryClient.invalidateQueries({ queryKey: ["crm-saved-views", currentPipeline?.id] })
      applySavedView(savedView)
      toast.success("Vista atualizada com sucesso!")
    },
    onError: () => {
      toast.error("Nção foi possível atualizar a vista.")
    },
  })

  const deleteSavedView = useMutation({
    mutationFn: async () => {
      if (!selectedSavedViewId) {
        throw new Error("Selecione uma vista salva para remover.")
      }
      await api.delete(`/api/crm/saved-views/${selectedSavedViewId}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-saved-views", currentPipeline?.id] })
      setSelectedSavedViewId(null)
      setSavedViewName("")
      toast.success("Vista removida com sucesso!")
    },
    onError: () => {
      toast.error("Nção foi possível remover a vista.")
    },
  })

  const handleTableSortingChange: OnChangeFn<SortingState> = (updater) => {
    setTableSorting((current) => (typeof updater === "function" ? updater(current) : updater))
  }

  const handleTableVisibilityChange: OnChangeFn<VisibilityState> = (updater) => {
    setTableColumnVisibility((current) => (typeof updater === "function" ? updater(current) : updater))
  }

  return (
    <ModuleGuard moduleCode="crm">
      {isLoading ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center gap-8">
              <div className="space-y-2">
                <Skeleton className="h-14 w-72 rounded-2xl" />
                <Skeleton className="h-5 w-[28rem] rounded-xl" />
              </div>
            </div>
            <Skeleton className="h-12 w-56 rounded-2xl" />
          </div>
          <KanbanSkeleton />
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-700">
          {/* Header Hero */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12">
               <PanelsTopLeft className="h-40 w-40 text-primary" />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-8 relative z-10">
              <div className="space-y-1">
                <h1 className="text-5xl font-black tracking-tighter flex items-center gap-6">
                    <div className="h-16 w-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                        <PanelsTopLeft className="h-8 w-8 text-primary" />
                    </div>
                    Pipeline CRM
                </h1>
                <p className="text-muted-foreground text-lg font-medium ml-1 opacity-70">Gestção estratégica de oportunidades e fluxos de serviço.</p>
              </div>

              <div className="h-12 w-[1px] bg-white/10 hidden sm:block mx-2" />

              {pipelines && pipelines.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Fluxo Ativo</p>
                  <Select 
                    value={selectedPipelineId?.toString() || pipelines[0]?.id?.toString() || ""} 
                    onValueChange={(val) => setSelectedPipelineId(parseInt(val))}
                  >
                    <SelectTrigger className="w-full sm:w-[260px] h-12 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 transition-all px-4 font-black uppercase tracking-widest text-xs shadow-inner">
                      <SelectValue placeholder="Fluxo" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                      {pipelines.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()} className="rounded-xl font-bold">{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-4 relative z-10">
              <Tabs value={view} onValueChange={(v) => setView(v as CRMViewMode)} className="h-12">
                <TabsList className="h-12 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md">
                  <TabsTrigger value="kanban" className="h-9 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">
                    <LayoutGrid className="mr-2 h-4 w-4" /> Kanban
                  </TabsTrigger>
                  <TabsTrigger value="list" className="h-9 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">
                    <List className="mr-2 h-4 w-4" /> Tabela
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="h-4 w-[1px] bg-border mx-1" />

              <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 gap-3 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-primary/80 transition-all shadow-lg"
                    asChild
                  >
                    <Link href="/itil-version-5">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="hidden lg:inline">Academy</span>
                    </Link>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 gap-3 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-primary/80 transition-all shadow-lg"
                    asChild
                  >
                    <Link href="/crm/analytics">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span className="hidden lg:inline">Analytics</span>
                    </Link>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-10 gap-3 rounded-xl border-white/10 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg",
                      showStats ? "bg-primary text-primary-foreground border-primary shadow-primary/30" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                    )}
                    onClick={() => setShowStats(!showStats)}
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span className="hidden sm:inline">Métricas</span>
                  </Button>
              </div>

              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowTriage(!showTriage)}
                className={cn("h-12 px-6 rounded-2xl gap-3 relative font-black uppercase tracking-widest text-[10px] border-white/10 shadow-lg transition-all", 
                  showTriage ? "bg-primary/10 text-primary border-primary/20" : "bg-white/5 text-muted-foreground hover:bg-white/10")}
              >
                <Inbox className="h-5 w-5" />
                <span className="hidden sm:inline">Triagem</span>
                {deals.filter(d => !d.column && !d.is_closed).length > 0 && (
                   <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 shadow-lg shadow-rose-500/40 animate-pulse" />
                )}
              </Button>

              {canManagePipelines && <PipelineManagerModal />}
              {currentPipeline && <ColumnGovernanceSheet pipeline={currentPipeline} deals={deals} />}
              {canDealEdit && <CreateDealModal pipeline={currentPipeline} />}
            </div>
          </div>

          {/* Filters & Actions */}
          {currentPipeline ? (
            <div className="rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl relative overflow-hidden group/filters">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/filters:opacity-100 transition-opacity duration-700" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-10">
                <div className="flex flex-1 items-center gap-3">
                   <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Pesquisar oportunidades..."
                        value={titleSearch}
                        onChange={(e) => setTitleSearch(e.target.value)}
                        className="h-12 pl-11 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 focus:ring-primary/20 transition-all shadow-inner font-medium"
                      />
                   </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className={cn("h-12 rounded-2xl px-6 font-black uppercase tracking-widest text-[10px] border-white/10 shadow-lg transition-all", 
                    controlsOpen ? "bg-primary text-primary-foreground border-primary shadow-primary/30" : "bg-white/5 text-muted-foreground hover:bg-white/10")}
                  onClick={() => setControlsOpen((current) => !current)}
                >
                  {controlsOpen ? (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" />
                      Ocultar Painel
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Filtros & Vistas
                    </>
                  )}
                  {activeFiltersCount > 0 ? (
                    <span className="ml-3 inline-flex items-center rounded-full bg-primary/20 px-2.5 py-0.5 text-[9px] font-black text-primary shadow-sm border border-primary/20">
                      {activeFiltersCount}
                    </span>
                  ) : null}
                </Button>
              </div>

              <div
                className={`mt-6 grid transition-[grid-template-rows,margin-top] duration-500 ${controlsOpen ? "grid-rows-[1fr] mt-6" : "grid-rows-[0fr] mt-0"}`}
              >
                <div className="overflow-hidden">
                  <div id="crm-controls-panel" className="grid gap-8 xl:grid-cols-2 pt-4 border-t border-white/10">
                    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl relative overflow-hidden">
                      <div className="mb-6 flex items-center justify-between gap-4">
                        <div className="space-y-1">
                           <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Refinar Resultados</h3>
                           <p className="text-[10px] text-muted-foreground font-bold">Ajuste os parâmetros de visualização ITIL.</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetViewState}
                          className="h-8 rounded-lg text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5"
                        >
                          Resetar
                        </Button>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Estágio do Fluxo</label>
                          <Select value={stageFilter} onValueChange={setStageFilter}>
                            <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold shadow-inner">
                              <SelectValue placeholder="Coluna" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                              <SelectItem value="all" className="rounded-xl font-bold">Todas as colunas</SelectItem>
                              {currentColumns.map((column) => (
                                <SelectItem key={column.id} value={String(column.id)} className="rounded-xl font-bold">
                                  {column.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Nível de Urgência</label>
                          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as CRMSavedViewFilters["priorityFilter"])}>
                            <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold shadow-inner">
                              <SelectValue placeholder="Urgência" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                              <SelectItem value="all" className="rounded-xl font-bold">Todas Urgências</SelectItem>
                              <SelectItem value="LOW" className="rounded-xl font-bold">Baixa</SelectItem>
                              <SelectItem value="MEDIUM" className="rounded-xl font-bold">Média</SelectItem>
                              <SelectItem value="HIGH" className="rounded-xl font-bold">Alta</SelectItem>
                              <SelectItem value="URGENT" className="rounded-xl font-bold">Urgente</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Proprietário</label>
                          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                            <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold shadow-inner">
                              <SelectValue placeholder="Responsável" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                              <SelectItem value="all" className="rounded-xl font-bold">Todos responsáveis</SelectItem>
                              {ownerOptions.map((user) => (
                                <SelectItem key={user.id} value={String(user.id)} className="rounded-xl font-bold">
                                  {getUserDisplayName(user)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Janela de Vencimento</label>
                          <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as CRMSavedViewFilters["dueFilter"])}>
                            <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold shadow-inner">
                              <SelectValue placeholder="Vencimento" />
                            </SelectTrigger>
                            <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                              <SelectItem value="all" className="rounded-xl font-bold">Todos os prazos</SelectItem>
                              <SelectItem value="overdue" className="rounded-xl font-bold">Vencidos</SelectItem>
                              <SelectItem value="today" className="rounded-xl font-bold">Vence Hoje</SelectItem>
                              <SelectItem value="this_week" className="rounded-xl font-bold">Esta Semana</SelectItem>
                              <SelectItem value="this_month" className="rounded-xl font-bold">Este Mês</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl relative overflow-hidden">
                      <div className="mb-6">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Persistência de Visção</h3>
                        <p className="mt-1 text-[10px] text-muted-foreground font-bold">
                          Armazene layouts, filtros e ordenações personalizadas.
                        </p>
                      </div>

                      <div className="grid gap-6">
                        <div className="space-y-2">
                           <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Vistas Disponíveis</label>
                           <Select
                             value={selectedSavedViewId ? selectedSavedViewId.toString() : "none"}
                             onValueChange={(value) => {
                               if (value === "none") {
                                 setSelectedSavedViewId(null)
                                 setSavedViewName("")
                                 resetViewState()
                                 return
                               }

                               const savedView = savedViews.find((item) => item.id.toString() === value)
                               if (savedView) {
                                 applySavedView(savedView)
                               }
                             }}
                           >
                             <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold shadow-inner">
                               <SelectValue placeholder={isLoadingSavedViews ? "Carregando..." : "Selecionar vista..."} />
                             </SelectTrigger>
                             <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                               <SelectItem value="none" className="rounded-xl font-bold">Sem vista salva</SelectItem>
                               {savedViews.map((savedView) => (
                                 <SelectItem key={savedView.id} value={savedView.id.toString()} className="rounded-xl font-bold">
                                   {savedView.is_default ? `${savedView.name} (padrção)` : savedView.name}
                                 </SelectItem>
                               ))}
                             </SelectContent>
                           </Select>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                           <div className="space-y-2">
                              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Novo Nome</label>
                              <Input
                                value={savedViewName}
                                onChange={(event) => setSavedViewName(event.target.value)}
                                placeholder="Ex: Leads Quentes"
                                className="h-11 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all text-xs font-bold shadow-inner"
                              />
                           </div>
                           <Button
                             variant="outline"
                             onClick={() => createSavedView.mutate()}
                             disabled={!currentPipeline || !savedViewName.trim() || createSavedView.isPending}
                             className="h-11 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] border-white/10 bg-primary/10 text-primary hover:bg-primary/20 shadow-lg transition-all"
                           >
                             {createSavedView.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                           </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2">
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => updateSavedView.mutate({})}
                             disabled={!selectedSavedViewId || !savedViewName.trim() || updateSavedView.isPending}
                             className="h-9 rounded-lg px-4 text-[9px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5 transition-all"
                           >
                             Atualizar Atual
                           </Button>
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => updateSavedView.mutate({ is_default: true })}
                             disabled={!selectedSavedViewId || updateSavedView.isPending}
                             className="h-9 rounded-lg px-4 text-[9px] font-black uppercase tracking-widest border-white/10 hover:bg-white/5 transition-all"
                           >
                             Definir como Padrção
                           </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => deleteSavedView.mutate()}
                             disabled={!selectedSavedViewId || deleteSavedView.isPending}
                             className="h-9 rounded-lg px-4 text-[9px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 transition-all"
                           >
                             Excluir Vista
                           </Button>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          ) : !isLoading && (
            <div className="h-[200px] flex items-center justify-center border-2 border-dashed border-white/10 rounded-[2.5rem] opacity-50 bg-white/5 backdrop-blur-xl">
              <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">Nenhum pipeline configurado para este fluxo.</p>
            </div>
          )}

          <AnimatePresence>
            {showStats && currentPipeline && (
               <motion.div
                 initial={{ height: 0, opacity: 0 }}
                 animate={{ height: "auto", opacity: 1 }}
                 exit={{ height: 0, opacity: 0 }}
                 className="overflow-hidden"
               >
                 <CRMPipelineOverview
                   pipeline={currentPipeline}
                   deals={deals}
                   overview={pipelineOverview || undefined}
                   isLoading={isLoadingOverview}
                 />
                 <div className="h-6" />
               </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showTriage && (
               <motion.div
                 initial={{ height: 0, opacity: 0 }}
                 animate={{ height: "auto", opacity: 1 }}
                 exit={{ height: 0, opacity: 0 }}
                 className="overflow-hidden"
               >
                 <CRMTriageInbox />
                 <div className="h-6" />
               </motion.div>
            )}
          </AnimatePresence>

          <Tabs value={view} onValueChange={(v) => setView(v as CRMViewMode)} className="w-full">
            <TabsContent value="kanban" className="m-0 outline-none">
              {currentPipeline ? (
                <KanbanBoard pipeline={currentPipeline} deals={filteredDeals} />
              ) : (
                <div className="h-[400px] flex items-center justify-center border-2 border-dashed border-white/10 rounded-[2.5rem] opacity-50 bg-white/5 backdrop-blur-xl">
                  <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">Nenhum pipeline configurado.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="list" className="m-0 outline-none">
              {currentPipeline ? (
                <CRMTableView
                  pipeline={currentPipeline}
                  deals={filteredDeals}
                  isLoading={isLoading}
                  sorting={tableSorting}
                  columnVisibility={tableColumnVisibility}
                  onSortingChange={handleTableSortingChange}
                  onColumnVisibilityChange={handleTableVisibilityChange}
                />
              ) : (
                <div className="h-[320px] flex items-center justify-center border-2 border-dashed border-white/10 rounded-[2.5rem] opacity-50 bg-white/5 backdrop-blur-xl">
                  <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">Nenhum pipeline configurado.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ModuleGuard>
  )
}

