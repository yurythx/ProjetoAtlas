import { useState, useEffect } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { toast } from "sonner"
import { AxiosError } from "axios"

export type CRMViewMode = "overview" | "kanban" | "list"

export interface Contact {
  id: number
  uuid: string
  name: string
  email?: string
  phone?: string
  company_name?: string
}

export interface Stage {
  id: number
  pipeline: number
  name: string
  order: number
}

export interface CRMColumn {
  id: number
  pipeline: number
  title: string
  order: number
  color: string
  column_kind?:
    | "backlog"
    | "planned"
    | "active"
    | "done"
    | "custom"
    | "discover"
    | "design"
    | "acquire"
    | "build"
    | "transition"
    | "operate"
    | "deliver"
    | "support"
  marks_done?: boolean
  requires_schedule?: boolean
  requires_assignee?: boolean
  allowed_source_columns?: number[]
  wip_limit?: number | null
  value_stream_phase: "demand" | "product_design" | "creation" | "onboarding" | "realization"
  legacy_stage?: number | null
  cards?: Deal[]
}

export function getProgressValue(deal: Deal) {
  const rawValue = deal.custom_fields?.progress_percentage
  const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue)

  if (!Number.isFinite(numericValue)) {
    return 0
  }

  return Math.max(0, Math.min(100, numericValue))
}

export function resolveDealProgress(deal: Deal, pipeline?: Pipeline) {
  const rawValue = deal.custom_fields?.progress_percentage
  if (rawValue !== undefined && rawValue !== null && rawValue !== "") {
    return getProgressValue(deal)
  }

  if (!pipeline) {
    return getProgressValue(deal)
  }

  const columns = getPipelineColumns(pipeline)
  if (columns.length <= 1) return getProgressValue(deal)

  const index = columns.findIndex((column) => {
    const dealColumnId = deal.column ?? deal.column_id
    if (typeof dealColumnId === "number") return dealColumnId === column.id
    if (typeof deal.stage === "number" && typeof column.legacy_stage === "number") {
      return deal.stage === column.legacy_stage
    }
    return false
  })

  if (index < 0) return getProgressValue(deal)
  const column = columns[index]
  if (column.marks_done || index === columns.length - 1) return 100
  return Math.round((index / (columns.length - 1)) * 100)
}

export interface Pipeline {
  id: number
  name: string
  description?: string
  visibility?: "company" | "group"
  groups?: number[]
  stages: Stage[]
  columns?: CRMColumn[]
}

export interface CRMSavedViewFilters {
  stageFilter: string
  priorityFilter: Deal["priority"] | "all"
  ownerFilter: string
  titleSearch: string
  dueFilter: "all" | "overdue" | "today" | "this_week" | "this_month"
}

export interface CRMSavedViewSortingItem {
  id: string
  desc: boolean
}

export interface CRMSavedView {
  id: number
  pipeline: number
  owner: number
  owner_name?: string
  name: string
  view_mode: CRMViewMode
  filters: Partial<CRMSavedViewFilters>
  sorting: CRMSavedViewSortingItem[]
  column_visibility: Record<string, boolean>
  is_default: boolean
}

export interface SLAPolicy {
  id: number
  name: string
  description?: string
  target_response_minutes: number
  target_resolution_minutes: number
  business_hours_only: boolean
}

export interface ServiceCategory {
  id: number
  name: string
  description?: string
  parent?: number
  icon?: string
}

export interface Swarm {
  id: number
  started_at: string
  ended_at: string | null
  is_active: boolean
  conversation_id: number | null
  participants: number[]
  participant_names: string[]
}

export interface ServiceDefinition {
  id: number
  category: number
  category_name: string
  name: string
  description?: string
  is_active: boolean
}

export interface ServiceItem {
  id: number
  definition: number
  definition_name: string
  category_name: string
  name: string
  description?: string
  record_type: "incident" | "service_request" | "problem" | "change"
  default_sla_policy?: number
  sla_policy_name?: string
  estimated_cost: number
  is_active: boolean
}

export interface CIType {
  id: number
  name: string
  description?: string
  icon?: string
  criticality_level: number
}

export interface CI {
  id: number
  ci_type: number
  ci_type_name: string
  name: string
  serial_number?: string
  asset_tag?: string
  status: "active" | "stored" | "retired" | "broken" | "ordered"
  owner?: number
  owner_name?: string
  location?: string
  attributes: Record<string, unknown>
}

export interface CIRelationship {
  id: number
  source: number
  source_name: string
  target: number
  target_name: string
  relation_kind: "runs_on" | "depends_on" | "member_of" | "manages" | "installed_on"
  description?: string
}

export interface DealActivity {
  id: number;
  activity_type: "column_change" | "stage_change" | "note" | "automation" | "creation" | "ai_action" | "ai_suggestion";
  description: string;
  actor_name: string;
  created_at: string;
  old_value?: unknown;
  new_value?: unknown;
}

export interface XLAFeedback {
  id: number
  deal: number
  contact: number
  rating: number
  comment?: string
  ease_of_use: number
  speed_satisfaction: number
  outcome_satisfaction: number
  created_at: string
}

export function useXLA(dealId?: number) {
  const queryClient = useQueryClient()
  
  const query = useQuery<XLAFeedback[]>({
    queryKey: ["xla-feedbacks", dealId],
    queryFn: async () => {
      const response = await api.get<XLAFeedback[] | { results?: XLAFeedback[] }>(`/api/crm/xla-feedbacks/`, {
        params: dealId ? { deal: dealId } : {}
      })
      return normalizeListResponse(response.data)
    },
    enabled: !!dealId,
  })

  const createFeedback = useMutation({
    mutationFn: async (payload: Partial<XLAFeedback>) => {
      const response = await api.post("/api/crm/xla-feedbacks/", payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xla-feedbacks", dealId] })
    }
  })

  return { ...query, createFeedback }
}

export interface DPSMDashboardData {
  health_score: number
  avg_xla: number
  xla_count: number
  total_active_flows: number
  vsm_distribution: Array<{ value_stream_phase: string; count: number }>
}

export function useDealTopology(dealId?: number) {
  return useQuery<{ nodes: any[]; links: any[] }>({
    queryKey: ["deal-topology", dealId],
    queryFn: async () => {
      const { data } = await api.get<{ nodes?: any[]; links?: any[] }>(`/api/crm/deals/${dealId}/topology/`)
      return {
        nodes: Array.isArray(data?.nodes) ? data.nodes : [],
        links: Array.isArray(data?.links) ? data.links : []
      }
    },
    enabled: !!dealId,
  })
}

export function useDPSMDashboard() {
  return useQuery<DPSMDashboardData>({
    queryKey: ["dpsm-dashboard"],
    queryFn: async () => {
      const { data } = await api.get<DPSMDashboardData>("/api/crm/dpsm-dashboard/")
      return {
        health_score: data?.health_score ?? 0,
        avg_xla: data?.avg_xla ?? 0,
        xla_count: data?.xla_count ?? 0,
        total_active_flows: data?.total_active_flows ?? 0,
        vsm_distribution: Array.isArray(data?.vsm_distribution) ? data.vsm_distribution : []
      }
    }
  })
}

export interface DPSMRecommendation {
  type: "bottleneck" | "experience_recovery" | "proactive_improvement"
  deal_id: number
  title: string
  reason: string
  action: string
}

export function useDPSMRecommendations() {
  return useQuery<{ vulnerabilities: DPSMRecommendation[]; opportunities: DPSMRecommendation[] }>({
    queryKey: ["dpsm-recommendations"],
    queryFn: async () => {
      const { data } = await api.get<{ vulnerabilities?: DPSMRecommendation[]; opportunities?: DPSMRecommendation[] }>("/api/crm/dpsm-dashboard/recommendations/")
      return {
        vulnerabilities: Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : [],
        opportunities: Array.isArray(data?.opportunities) ? data.opportunities : []
      }
    }
  })
}

export interface DealNoteInput {
  dealId: number
  description: string
}

export interface DealAttachmentUploadInput {
  dealId: number
  file: File
  kind?: "photo" | "file"
  phase?: "before" | "during" | "after"
  caption?: string
  title?: string
  alt_text?: string
}

export interface DealAttachmentLinkInput {
  dealId: number
  mediaId: string
  kind?: "photo" | "file"
  phase?: "before" | "during" | "after"
  caption?: string
}

export interface DealAttachmentDeleteInput {
  dealId: number
  attachmentId: string
}

export interface DealAttachment {
  id: string
  deal: number
  media: string
  media_file_url: string
  media_file_type: string
  media_file_size: number
  media_title: string
  kind: "photo" | "file"
  phase: "before" | "during" | "after"
  caption: string
  created_by: number | null
  created_by_username: string
  created_at: string
}

export interface Deal {
  id: number
  uuid: string
  title: string
  description?: string
  record_type: "incident" | "service_request" | "problem" | "change" | "opportunity"
  contact: number
  contact_name: string
  stage?: number
  stage_name?: string
  stage_legacy_id?: number
  stage_legacy_name?: string
  column?: number | null
  column_id?: number | null
  column_title?: string
  column_data?: CRMColumn | null
  value: number | string
  closing_date?: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  service_item?: number | ServiceItem
  affected_cis?: number[] | CI[]
  risk_level?: "low" | "medium" | "high" | "critical" | null
  change_justification?: string
  implementation_plan?: string
  backout_plan?: string
  test_plan?: string
  root_cause?: string
  resolution_steps?: string
  is_known_error?: boolean
  xla_score?: number | null
  ai_metadata?: {
    risk_level?: "low" | "medium" | "high" | "critical"
    risk_reason?: string
    suggested_actions?: string[]
    insight?: string
  } | null
  owner: number
  is_closed: boolean
  external_id?: string | null
  integration_source?: string
  data_agendamento?: string
  tecnico_responsavel?: number | null
  custom_fields?: Record<string, unknown>
  activities?: DealActivity[]
  attachments?: DealAttachment[]
  messenger_conversation?: number | null
  // SLA ITIL version 5
  sla_policy?: number | null
  sla_policy_data?: SLAPolicy | null
  sla_response_deadline?: string | null
  sla_resolution_deadline?: string | null
  first_response_at?: string | null
  sla_status: "within" | "at_risk" | "breached"
  swarm?: Swarm | null
}

export function normalizeListResponse<T>(data: T[] | { results?: T[] } | undefined): T[] {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

function unwrapFirst(value: unknown) {
  if (Array.isArray(value)) return value[0]
  return value
}

function getResponseData(err: unknown) {
  if (!err || typeof err !== "object") return null
  if (!("response" in err)) return null
  const response = (err as { response?: { data?: unknown } }).response
  const data = response?.data
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

function isNetworkError(err: unknown) {
  return err instanceof AxiosError && !err.response
}

export function isCRMNetworkError(err: unknown) {
  return isNetworkError(err)
}

function mergeDealCache(currentDeals: Deal[] | undefined, updatedDeal: Deal) {
  if (!currentDeals) return [updatedDeal]
  const exists = currentDeals.some((deal) => deal.id === updatedDeal.id)
  if (!exists) return [updatedDeal, ...currentDeals]
  return currentDeals.map((deal) => deal.id === updatedDeal.id ? updatedDeal : deal)
}

function normalizeColumnSemanticText(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

export function inferColumnSemantics(title?: string | null) {
  const normalizedTitle = normalizeColumnSemanticText(title)

  if (["novo", "new", "backlog"].includes(normalizedTitle)) {
    return {
      column_kind: "backlog" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("planejad") || normalizedTitle.includes("agendad")) {
    return {
      column_kind: "planned" as const,
      marks_done: false,
      requires_schedule: true,
      requires_assignee: true,
    }
  }

  if (["andamento", "execucao", "progresso", "in progress", "doing"].some((token) => normalizedTitle.includes(token))) {
    return {
      column_kind: "active" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (["concluid", "finaliz", "encerr", "done", "closed"].some((token) => normalizedTitle.includes(token))) {
    return {
      column_kind: "done" as const,
      marks_done: true,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("descoberta") || normalizedTitle.includes("discover")) {
    return {
      column_kind: "discover" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("design") || normalizedTitle.includes("projeto")) {
    return {
      column_kind: "design" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("aquisic") || normalizedTitle.includes("acquire")) {
    return {
      column_kind: "acquire" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("constru") || normalizedTitle.includes("build") || normalizedTitle.includes("desenvolv")) {
    return {
      column_kind: "build" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("transit") || normalizedTitle.includes("homolog") || normalizedTitle.includes("test")) {
    return {
      column_kind: "transition" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("oper") || normalizedTitle.includes("live") || normalizedTitle.includes("producao")) {
    return {
      column_kind: "operate" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("entreg") || normalizedTitle.includes("deliver")) {
    return {
      column_kind: "deliver" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  if (normalizedTitle.includes("suporte") || normalizedTitle.includes("support") || normalizedTitle.includes("atend")) {
    return {
      column_kind: "support" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    }
  }

  return {
    column_kind: "custom" as const,
    marks_done: false,
    requires_schedule: false,
    requires_assignee: false,
  }
}

export function resolveColumnSemantics(column?: Partial<CRMColumn> | null) {
  const inferred = inferColumnSemantics(column?.title)

  return {
    column_kind: column?.column_kind ?? inferred.column_kind,
    marks_done: column?.marks_done ?? inferred.marks_done,
    requires_schedule: column?.requires_schedule ?? inferred.requires_schedule,
    requires_assignee: column?.requires_assignee ?? inferred.requires_assignee,
    allowed_source_columns: Array.isArray(column?.allowed_source_columns) ? column?.allowed_source_columns : [],
    wip_limit: typeof column?.wip_limit === "number" ? column.wip_limit : null,
  }
}

export function getPipelineColumns(pipeline: Pipeline | null | undefined): CRMColumn[] {
  if (!pipeline) return []
  if (pipeline.columns && Array.isArray(pipeline.columns) && pipeline.columns.length > 0) {
    return [...pipeline.columns]
      .map((column) => ({ ...column, ...resolveColumnSemantics(column) }))
      .sort((a, b) => a.order - b.order || a.id - b.id)
  }

  const stages = Array.isArray(pipeline.stages) ? pipeline.stages : []
  return [...stages]
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map((stage) => ({
      id: stage.id,
      pipeline: stage.pipeline,
      title: stage.name,
      order: stage.order,
      color: "#CBD5E1",
      ...inferColumnSemantics(stage.name),
      value_stream_phase: "demand" as const, // Fallback for legacy stages mapped dynamically
      legacy_stage: stage.id,
    }))
}

export function getPipelineStageFromColumn(pipeline: Pipeline, columnId?: number | null) {
  if (!columnId) return undefined

  const column = getPipelineColumns(pipeline).find((item) => item.id === columnId)
  if (!column) return undefined

  if (column.legacy_stage) {
    return pipeline.stages.find((stage) => stage.id === column.legacy_stage)
  }

  return pipeline.stages.find((stage) => stage.name === column.title)
}

export function getDealColumnTitle(deal: Pick<Deal, "column_title" | "stage_name">) {
  return deal.column_title || deal.stage_name || "Sem coluna"
}

export function getDealColumnId(deal: Pick<Deal, "column" | "column_id" | "stage">) {
  return deal.column ?? deal.column_id ?? deal.stage
}

export function isDealInColumn(
  deal: Pick<Deal, "column" | "stage">,
  column: Pick<CRMColumn, "id" | "legacy_stage">
) {
  if (deal.column) {
    return deal.column === column.id
  }

  return deal.stage === column.legacy_stage
}

export function getDealColumnMeta(
  deal: Partial<Deal>,
  pipelines?: Pipeline[]
) {
  if (deal.column_data) {
    return {
      ...deal.column_data,
      ...resolveColumnSemantics(deal.column_data),
    }
  }

  const columnId = deal.column ?? deal.column_id
  if (columnId && Array.isArray(pipelines)) {
    const resolvedColumn = pipelines
      .flatMap((pipeline) => getPipelineColumns(pipeline))
      .find((column) => column.id === columnId)

    if (resolvedColumn) {
      return resolvedColumn
    }
  }

  const fallbackTitle = getDealColumnTitle(deal)
  return {
    id: columnId ?? 0,
    pipeline: 0,
    title: fallbackTitle,
    order: 0,
    color: "#CBD5E1",
    ...inferColumnSemantics(fallbackTitle),
  }
}

export function isDealDone(
  deal: Partial<Deal> & Pick<Deal, "is_closed">,
  pipelines?: Pipeline[]
) {
  const progress = typeof deal.custom_fields?.progress_percentage === "number"
    ? deal.custom_fields.progress_percentage
    : Number(deal.custom_fields?.progress_percentage)
  const safeProgress = Number.isFinite(progress) ? progress : 0
  return deal.is_closed || resolveColumnSemantics(getDealColumnMeta(deal, pipelines)).marks_done || safeProgress >= 100
}

export function getColumnOccupancy(
  columnId: number,
  deals: Array<Partial<Deal> & Pick<Deal, "id">>,
  pipelines?: Pipeline[],
  ignoreDealId?: number
) {
  return deals.filter((deal) => {
    if (ignoreDealId && deal.id === ignoreDealId) return false
    const dealColumnId = getDealColumnId(deal as Pick<Deal, "column" | "column_id" | "stage">)
    if (dealColumnId) return dealColumnId === columnId

    if (!Array.isArray(pipelines)) return false
    const resolvedColumn = pipelines
      .flatMap((pipeline) => getPipelineColumns(pipeline))
      .find((column) => isDealInColumn(deal, column))
    return resolvedColumn?.id === columnId
  }).length
}

export function getColumnTransitionGuard(
  deal: Partial<Deal>,
  targetColumn: Partial<CRMColumn> | null | undefined,
  deals: Array<Partial<Deal> & Pick<Deal, "id">>,
  pipelines?: Pipeline[]
) {
  if (!targetColumn?.id) {
    return { allowed: false, reason: "Selecione uma coluna válida." }
  }

  const sourceColumnId = getDealColumnId(deal as Pick<Deal, "column" | "column_id" | "stage">)
  const semantics = resolveColumnSemantics(targetColumn)
  const pipelineColumns = Array.isArray(pipelines) ? pipelines.flatMap((pipeline) => getPipelineColumns(pipeline)) : []
  const sourceColumn = sourceColumnId ? pipelineColumns.find((column) => column.id === sourceColumnId) : null

  if (sourceColumnId && sourceColumnId === targetColumn.id) {
    return { allowed: true, reason: null }
  }

  if (semantics.allowed_source_columns.length > 0 && (!sourceColumnId || !semantics.allowed_source_columns.includes(sourceColumnId))) {
    const allowedOrigins = semantics.allowed_source_columns
      .map((columnId) => pipelineColumns.find((column) => column.id === columnId)?.title)
      .filter(Boolean)
    return {
      allowed: false,
      reason: `A coluna '${targetColumn.title || "destino"}' não aceita cards vindos de '${sourceColumn?.title || "sem origem definida"}'.${allowedOrigins.length ? ` Origens permitidas: ${allowedOrigins.join(", ")}.` : ""}`,
    }
  }

  const ignoreDealId = typeof deal.id === "number" ? deal.id : undefined
  const occupancy = semantics.wip_limit ? getColumnOccupancy(targetColumn.id, deals, pipelines, ignoreDealId) : 0
  if (semantics.wip_limit && occupancy >= semantics.wip_limit) {
    return {
      allowed: false,
      reason: `A coluna '${targetColumn.title || "destino"}' atingiu o limite WIP de ${semantics.wip_limit} cards (${occupancy}/${semantics.wip_limit}).`,
    }
  }

  return { allowed: true, reason: null }
}

const DEALS_FUTURE_PAYLOAD_QUERY = "?omit_legacy_stage_fields=1"

export function useCRM() {
  const queryClient = useQueryClient()

  // Pipelines e Estágios
  const { data: pipelines = [], isLoading: isLoadingPipelines } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: async () => {
      const response = await api.get<Pipeline[] | { results?: Pipeline[] }>('/api/crm/pipelines/')
      return normalizeListResponse(response.data)
    }
  })

  // Deals (Cards do Kanban)
  const { data: deals = [], isLoading: isLoadingDeals } = useQuery({
    queryKey: ['crm-deals'],
    queryFn: async () => {
      const response = await api.get<Deal[] | { results?: Deal[] }>(`/api/crm/deals/${DEALS_FUTURE_PAYLOAD_QUERY}`)
      return normalizeListResponse(response.data)
    }
  })

  // Contatos
  const { data: contacts = [] } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: async () => {
      const response = await api.get<Contact[] | { results?: Contact[] }>('/api/crm/contacts/')
      return normalizeListResponse(response.data)
    }
  })

  // Mutations
  const createDeal = useMutation({
    mutationFn: async (newDeal: Partial<Deal>) => {
      const response = await api.post(`/api/crm/deals/${DEALS_FUTURE_PAYLOAD_QUERY}`, newDeal)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] }) // Sincronização!
      toast.success("Card criado com sucesso!")
    }
  })

  const updateDeal = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Deal> & { id: number }) => {
      const response = await api.patch<Deal>(`/api/crm/deals/${id}/${DEALS_FUTURE_PAYLOAD_QUERY}`, data)
      return response.data
    },
    onMutate: async (updatedDeal) => {
      // 1. Cancela refetches em andamento para não sobrescrever a atualização otimista
      await queryClient.cancelQueries({ queryKey: ['crm-deals'] })

      // 2. Snapshot do estado anterior para permitir rollback
      const previousDeals = queryClient.getQueryData<Deal[]>(['crm-deals'])
      const pipelines = queryClient.getQueryData<Pipeline[]>(['crm-pipelines']) || []
      const targetColumn = updatedDeal.column && Array.isArray(pipelines)
        ? pipelines
            .flatMap((pipeline) => getPipelineColumns(pipeline))
            .find((column) => column.id === updatedDeal.column)
        : undefined
      const targetPipeline = targetColumn
        ? pipelines.find((pipeline) => pipeline.id === targetColumn.pipeline)
        : undefined
      const targetStage = updatedDeal.stage && Array.isArray(pipelines)
        ? pipelines.flatMap((pipeline) => Array.isArray(pipeline.stages) ? pipeline.stages : []).find((stage) => stage.id === updatedDeal.stage)
        : targetPipeline && targetColumn
          ? getPipelineStageFromColumn(targetPipeline, targetColumn.id)
          : undefined

      // 3. Atualiza o cache de forma otimista
      if (previousDeals) {
        queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => {
          return old?.map((deal) => {
            if (deal.id !== updatedDeal.id) return deal;

            // Calcula progresso otimista
            let optimisticProgress = getProgressValue(deal);
            if (targetColumn && targetPipeline) {
              const allColumns = getPipelineColumns(targetPipeline);
              const currentIndex = allColumns.findIndex(c => c.id === targetColumn.id);
              if (currentIndex !== -1) {
                if (targetColumn.marks_done || currentIndex === allColumns.length - 1) {
                  optimisticProgress = 100;
                } else {
                  optimisticProgress = Math.round((currentIndex / (allColumns.length - 1)) * 100);
                }
              }
            }

            return {
              ...deal,
              ...updatedDeal,
              stage: updatedDeal.stage ?? targetStage?.id ?? deal.stage,
              stage_name: targetStage?.name || deal.stage_name,
              column: updatedDeal.column ?? targetColumn?.id ?? getDealColumnId(deal),
              column_title: targetColumn?.title || deal.column_title,
              column_data: targetColumn
                ? { ...targetColumn, ...resolveColumnSemantics(targetColumn) }
                : deal.column_data,
              is_closed: targetColumn
                ? (() => {
                    const allColumns = getPipelineColumns(targetPipeline!)
                    const currentIndex = allColumns.findIndex((c) => c.id === targetColumn.id)
                    return resolveColumnSemantics(targetColumn).marks_done || currentIndex === allColumns.length - 1
                  })()
                : deal.is_closed,
              custom_fields: {
                ...(deal.custom_fields || {}),
                ...(updatedDeal.custom_fields || {}),
                progress_percentage: optimisticProgress
              }
            };
          })
        })
      }

      // Retorna o contexto com o snapshot
      return { previousDeals }
    },
    onError: (err: unknown, _updatedDeal, context) => {
      // Se a mutação falhar, reverte para o estado anterior
      if (context?.previousDeals) {
        queryClient.setQueryData(['crm-deals'], context.previousDeals)
      }
      const data = getResponseData(err)
      const columnErrors = data?.column
      const message = unwrapFirst(columnErrors) || data?.detail || "Erro ao mover card."
      toast.error(String(message))
    },
    onSuccess: (savedDeal) => {
      queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => mergeDealCache(old, savedDeal))
      toast.success("Progresso atualizado!")
    },
    onSettled: () => {
      // Sempre invalida as queries para garantir sincronização final com o servidor (Background)
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] })
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const addDealNote = useMutation({
    mutationFn: async ({ dealId, description }: DealNoteInput) => {
      const response = await api.post<Deal>(`/api/crm/deals/${dealId}/notes/`, { description })
      return response.data
    },
    onSuccess: (savedDeal) => {
      queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => mergeDealCache(old, savedDeal))
      toast.success("Atualização publicada!")
    },
    onError: (err: unknown) => {
      const data = getResponseData(err)
      const detail = data?.description
      const message = unwrapFirst(detail) || data?.detail || "Não foi possível publicar a atualização."
      toast.error(String(message))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const addDealAttachment = useMutation({
    mutationFn: async (input: DealAttachmentUploadInput | DealAttachmentLinkInput) => {
      const formData = new FormData()
      const kind = input.kind || "photo"
      const phase = input.phase || "during"
      formData.append("kind", kind)
      formData.append("phase", phase)
      if (input.caption) formData.append("caption", input.caption)

      if ("file" in input) {
        formData.append("file", input.file)
        if (input.title) formData.append("title", input.title)
        if (input.alt_text) formData.append("alt_text", input.alt_text)
      } else {
        formData.append("media_id", input.mediaId)
      }

      const response = await api.post<Deal>(`/api/crm/deals/${input.dealId}/attachments/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      return response.data
    },
    onSuccess: (savedDeal) => {
      queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => mergeDealCache(old, savedDeal))
      toast.success("Anexo adicionado!")
    },
    onError: (err: unknown) => {
      if (isNetworkError(err)) return
      const data = getResponseData(err)
      const message = data?.detail || "Não foi possível anexar o arquivo."
      toast.error(String(message))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] })
    }
  })

  const deleteDealAttachment = useMutation({
    mutationFn: async ({ dealId, attachmentId }: DealAttachmentDeleteInput) => {
      const response = await api.delete<Deal>(`/api/crm/deals/${dealId}/attachments/${attachmentId}/`)
      return response.data
    },
    onSuccess: (savedDeal) => {
      queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => mergeDealCache(old, savedDeal))
      toast.success("Anexo removido.")
    },
    onError: (err: unknown) => {
      const data = getResponseData(err)
      const message = data?.detail || "Não foi possível remover o anexo."
      toast.error(String(message))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] })
    }
  })

  const startSwarm = useMutation({
    mutationFn: async (dealId: number) => {
      const { data } = await api.post<Deal>(`/api/crm/deals/${dealId}/start_swarm/`)
      return data
    },
    onSuccess: (updatedDeal) => {
      queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => mergeDealCache(old, updatedDeal))
      toast.success("Swarm (War Room) iniciado!")
    }
  })

  const endSwarm = useMutation({
    mutationFn: async (dealId: number) => {
      const { data } = await api.post<Deal>(`/api/crm/deals/${dealId}/end-swarm/`)
      return data
    },
    onSuccess: (updatedDeal) => {
      queryClient.setQueryData<Deal[]>(['crm-deals'], (old) => mergeDealCache(old, updatedDeal))
      toast.success("Swarm finalizado.")
    }
  })

  return {
    pipelines,
    deals,
    contacts,
    isLoading: isLoadingPipelines || isLoadingDeals,
    createDeal,
    updateDeal,
    addDealNote,
    addDealAttachment,
    deleteDealAttachment,
    startSwarm,
    endSwarm
  }
}

export function useServiceCatalog() {
  const { data: categories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["service-categories"],
    queryFn: async () => {
      const response = await api.get("/api/service-catalog/categories/")
      return normalizeListResponse(response.data)
    },
  })

  const { data: items = [] } = useQuery<ServiceItem[]>({
    queryKey: ["service-items"],
    queryFn: async () => {
      const response = await api.get("/api/service-catalog/items/")
      return normalizeListResponse(response.data)
    },
  })

  return { categories, items }
}

export function useCMDB() {
  const { data: ciTypes = [] } = useQuery<CIType[]>({
    queryKey: ["cmdb-types"],
    queryFn: async () => {
      const response = await api.get("/api/cmdb/types/")
      return normalizeListResponse(response.data)
    },
  })

  const { data: cis = [] } = useQuery<CI[]>({
    queryKey: ["cmdb-items"],
    queryFn: async () => {
      const response = await api.get("/api/cmdb/items/")
      return normalizeListResponse(response.data)
    },
  })

  return { ciTypes, cis }
}

// ─── Evolution API / WhatsApp Config ──────────────────────────────────────────

export interface EvolutionConfig {
  id: number
  instance_name: string
  api_url: string
  api_token?: string
  is_active: boolean
  webhook_token: string
  webhook_url: string
  default_pipeline: number | null
  default_column: number | null
}

export function useEvolutionConfig() {
  const queryClient = useQueryClient()

  const { data: configs = [], isLoading } = useQuery<EvolutionConfig[]>({
    queryKey: ["evolution-config"],
    queryFn: async () => {
      const response = await api.get<EvolutionConfig[] | { results?: EvolutionConfig[] }>("/api/crm/evolution-config/")
      return normalizeListResponse(response.data)
    },
  })

  const createConfig = useMutation({
    mutationFn: (data: Partial<EvolutionConfig>) =>
      api.post("/api/crm/evolution-config/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-config"] })
      toast.success("Integração WhatsApp criada!")
    },
    onError: (err: AxiosError<Record<string, string[]>>) => {
      const msg = Object.values(err.response?.data ?? {}).flat().join(", ") || "Erro ao criar integração."
      toast.error(msg)
    },
  })

  const updateConfig = useMutation({
    mutationFn: ({ id, ...data }: Partial<EvolutionConfig> & { id: number }) =>
      api.patch(`/api/crm/evolution-config/${id}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-config"] })
      toast.success("Configuração atualizada!")
    },
    onError: () => toast.error("Erro ao atualizar configuração."),
  })

  const deleteConfig = useMutation({
    mutationFn: (id: number) => api.delete(`/api/crm/evolution-config/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evolution-config"] })
      toast.success("Integração removida.")
    },
    onError: () => toast.error("Erro ao remover integração."),
  })

  return { configs, isLoading, createConfig, updateConfig, deleteConfig }
}

/**
 * Monitor inteligente de SLAs para notificações em tempo real.
 * Utilizado no layout principal do CRM para alertar sobre cards em risco ou rompidos.
 */
export function useSLAMonitor() {
  const { deals } = useCRM()
  const [notifiedIds, setNotifiedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const criticalDeals = (deals || []).filter(
      (d) => d.sla_status === "at_risk" || d.sla_status === "breached"
    )

    criticalDeals.forEach((deal) => {
      if (!notifiedIds.has(deal.id)) {
        if (deal.sla_status === "breached") {
          toast.error(`SLA ROMPIDO: Card #${deal.id}`, {
            description: deal.title,
            duration: 8000,
          })
        } else {
          toast.warning(`RISCO DE SLA: Card #${deal.id} em estado crítico!`, {
            description: deal.title,
            duration: 5000,
          })
        }
        setNotifiedIds((prev) => new Set(prev).add(deal.id))
      }
    })
  }, [deals, notifiedIds])
}
