"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { CRMSavedView, CRMViewMode, getPipelineColumns, useCRM, CRMSavedViewFilters } from "./use-crm"
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
import { BarChart3, ChevronDown, ChevronUp, LayoutGrid, List, PanelsTopLeft } from "lucide-react"
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
  return value === "kanban" || value === "table" || value === "overview"
}

export default function CRMPage() {
  const { pipelines, deals, isLoading } = useCRM()
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

  // Seleciona o primeiro pipeline por padrão
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

    // Se nao temos vista selecionada, tentamos aplicar a padrao do pipeline
    const defaultSavedView = savedViews.find((item) => item.is_default)
    if (defaultSavedView && !selectedSavedViewId) {
      applySavedView(defaultSavedView)
      return
    }

    // Se nao houver vista padrao e houver algo selecionado que nao existe mais, limpamos
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
      toast.error("Não foi possível salvar a vista.")
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
      toast.error("Não foi possível atualizar a vista.")
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
      toast.error("Não foi possível remover a vista.")
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
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-10 w-64 rounded-2xl" />
              <Skeleton className="h-4 w-96 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-48 rounded-xl" />
          </div>
          <KanbanSkeleton />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between bg-card/60 backdrop-blur-sm p-4 rounded-3xl border shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <PageHeader
                title="CRM"
                description=""
                className="p-0 border-none bg-transparent"
              />

              <div className="h-4 w-[1px] bg-border hidden sm:block mx-1" />

              {pipelines && pipelines.length > 0 ? (
                <Select 
                  value={selectedPipelineId?.toString() || pipelines[0]?.id?.toString() || ""} 
                  onValueChange={(val) => setSelectedPipelineId(parseInt(val))}
                >
                  <SelectTrigger className="w-full sm:w-[220px] h-9 rounded-xl border-none bg-muted/50 hover:bg-muted transition-colors px-3 font-semibold">
                    <SelectValue placeholder="Fluxo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {pipelines.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()} className="rounded-lg">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={view} onValueChange={(v) => setView(v as CRMViewMode)} className="h-9">
                <TabsList className="h-9 bg-muted/50 p-1 rounded-xl">
                  <TabsTrigger value="kanban" className="h-7 text-xs rounded-lg px-3">
                    <LayoutGrid className="mr-2 h-3.5 w-3.5" /> Kanban
                  </TabsTrigger>
                  <TabsTrigger value="list" className="h-7 text-xs rounded-lg px-3">
                    <List className="mr-2 h-3.5 w-3.5" /> Tabela
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="h-4 w-[1px] bg-border mx-1" />

              <div className="flex items-center gap-1 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 rounded-xl text-xs font-semibold text-primary/70 hover:text-primary hover:bg-primary/10"
                    asChild
                  >
                    <Link href="/itil-v5">
                      <BookOpen className="h-4 w-4" />
                      <span className="hidden lg:inline">Atlas Academy</span>
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 rounded-xl text-xs font-semibold text-primary/70 hover:text-primary hover:bg-primary/10"
                    asChild
                  >
                    <Link href="/crm/analytics">
                      <BarChart3 className="h-4 w-4" />
                      <span className="hidden lg:inline">Analytics</span>
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 gap-2 rounded-xl text-xs font-semibold transition-all",
                      showStats ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={() => setShowStats(!showStats)}
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span className="hidden sm:inline">Métricas</span>
                  </Button>
              </div>

              <Button 
                variant={showTriage ? "secondary" : "ghost"} 
                size="sm" 
                onClick={() => setShowTriage(!showTriage)}
                className={cn("h-9 rounded-xl gap-2 relative", showTriage && "bg-primary/10 text-primary")}
              >
                <Inbox className="h-4 w-4" />
                <span className="hidden sm:inline">Triagem</span>
                {deals.filter(d => !d.column && !d.is_closed).length > 0 && (
                   <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                )}
              </Button>

              {canManagePipelines && <PipelineManagerModal />}
              {currentPipeline && <ColumnGovernanceSheet pipeline={currentPipeline} deals={deals} />}
              {canDealEdit && <CreateDealModal pipeline={currentPipeline} />}
            </div>
          </div>

          {currentPipeline ? (
            <div className="rounded-3xl border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    placeholder="Buscar por título..."
                    value={titleSearch}
                    onChange={(e) => setTitleSearch(e.target.value)}
                    className="glass"
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="glass w-full sm:w-auto"
                  aria-expanded={controlsOpen}
                  aria-controls="crm-controls-panel"
                  onClick={() => setControlsOpen((current) => !current)}
                >
                  {controlsOpen ? (
                    <>
                      <ChevronUp className="mr-2 h-4 w-4" />
                      Minimizar
                    </>
                  ) : (
                    <>
                      <ChevronDown className="mr-2 h-4 w-4" />
                      Filtros & Vistas
                    </>
                  )}
                  {activeFiltersCount > 0 ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {activeFiltersCount}
                    </span>
                  ) : null}
                </Button>
              </div>

              <div
                className={`mt-4 grid transition-[grid-template-rows] duration-200 ${controlsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <div id="crm-controls-panel" className="grid gap-6 xl:grid-cols-2">
                    <section className="rounded-2xl border bg-background/60 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Filtros</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={resetViewState}
                          className="text-muted-foreground hover:text-primary"
                        >
                          Limpar
                        </Button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select value={stageFilter} onValueChange={setStageFilter}>
                          <SelectTrigger className="w-full glass">
                            <SelectValue placeholder="Coluna" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas as colunas</SelectItem>
                            {currentColumns.map((column) => (
                              <SelectItem key={column.id} value={String(column.id)}>
                                {column.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as CRMSavedViewFilters["priorityFilter"])}>
                          <SelectTrigger className="w-full glass">
                            <SelectValue placeholder="Urgência" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas Urgências</SelectItem>
                            <SelectItem value="LOW">Baixa</SelectItem>
                            <SelectItem value="MEDIUM">Média</SelectItem>
                            <SelectItem value="HIGH">Alta</SelectItem>
                            <SelectItem value="URGENT">Urgente</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                          <SelectTrigger className="w-full glass">
                            <SelectValue placeholder="Responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos responsáveis</SelectItem>
                            {ownerOptions.map((user) => (
                              <SelectItem key={user.id} value={String(user.id)}>
                                {getUserDisplayName(user)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as CRMSavedViewFilters["dueFilter"])}>
                          <SelectTrigger className="w-full glass">
                            <SelectValue placeholder="Vencimento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os prazos</SelectItem>
                            <SelectItem value="overdue">Vencidos</SelectItem>
                            <SelectItem value="today">Vence Hoje</SelectItem>
                            <SelectItem value="this_week">Esta Semana</SelectItem>
                            <SelectItem value="this_month">Este Mês</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </section>

                    <section className="rounded-2xl border bg-background/60 p-4">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Vistas salvas</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Salve combinações de aba, filtros, ordenação e colunas por pipeline.
                        </p>
                      </div>

                      <div className="grid gap-3">
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
                          <SelectTrigger className="w-full glass">
                            <SelectValue placeholder={isLoadingSavedViews ? "Carregando vistas..." : "Selecione uma vista"} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem vista salva</SelectItem>
                            {savedViews.map((savedView) => (
                              <SelectItem key={savedView.id} value={savedView.id.toString()}>
                                {savedView.is_default ? `${savedView.name} (padrão)` : savedView.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                           <Input
                             value={savedViewName}
                             onChange={(event) => setSavedViewName(event.target.value)}
                             placeholder="Nome da vista"
                             className="w-full"
                           />
                           <Button
                             variant="outline"
                             onClick={() => createSavedView.mutate()}
                             disabled={!currentPipeline || !savedViewName.trim() || createSavedView.isPending}
                             className="w-full sm:w-auto"
                           >
                             Salvar nova
                           </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                           <Button
                             variant="outline"
                             onClick={() => updateSavedView.mutate({})}
                             disabled={!selectedSavedViewId || !savedViewName.trim() || updateSavedView.isPending}
                           >
                             Atualizar
                           </Button>
                           <Button
                             variant="outline"
                             onClick={() => updateSavedView.mutate({ is_default: true })}
                             disabled={!selectedSavedViewId || updateSavedView.isPending}
                           >
                             Definir padrão
                           </Button>
                           <Button
                             variant="ghost"
                             onClick={() => deleteSavedView.mutate()}
                             disabled={!selectedSavedViewId || deleteSavedView.isPending}
                           >
                             Remover
                           </Button>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </div>
          ) : !isLoading && (
            <div className="h-[200px] flex items-center justify-center border-2 border-dashed rounded-3xl opacity-50">
              Nenhum pipeline configurado para este fluxo.
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
                <div className="h-[400px] flex items-center justify-center border-2 border-dashed rounded-3xl opacity-50">
                  Nenhum pipeline configurado.
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
                <div className="h-[320px] flex items-center justify-center border-2 border-dashed rounded-3xl opacity-50">
                  Nenhum pipeline configurado.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </ModuleGuard>
  )
}
