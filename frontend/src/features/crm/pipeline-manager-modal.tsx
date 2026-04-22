"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, Plus, Settings2, Trash2, Rocket } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Pipeline, CRMColumn, useCRM } from "./use-crm"
import type { CRMGroup } from "@/types"

type NewPipelineStep = "idle" | "creating" | "creating_columns"
type TriggerIcon = "settings" | "plus"

type PipelineManagerModalProps = {
  triggerLabel?: string
  triggerIcon?: TriggerIcon
  triggerVariant?: "outline" | "default" | "secondary" | "ghost"
  triggerClassName?: string
}

function parseListResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (typeof data === "object" && data !== null && "results" in data) {
    const results = (data as { results?: unknown }).results
    return Array.isArray(results) ? (results as T[]) : []
  }
  return []
}

function getDefaultColumnsPayload(pipelineId: number) {
  return [
    { pipeline: pipelineId, title: "Novo", order: 0, color: "#16A34A", column_kind: "backlog" as const },
    { pipeline: pipelineId, title: "Planejado", order: 1, color: "#8B5CF6", column_kind: "planned" as const },
    { pipeline: pipelineId, title: "Em Andamento", order: 2, color: "#3B82F6", column_kind: "active" as const },
    { pipeline: pipelineId, title: "Concluído", order: 3, color: "#111827", column_kind: "done" as const, marks_done: true },
  ]
}

function getErrorDetail(error: unknown) {
  if (typeof error !== "object" || error === null) return null
  const response = (error as { response?: unknown }).response
  if (typeof response !== "object" || response === null) return null
  const data = (response as { data?: unknown }).data
  if (typeof data !== "object" || data === null) return null
  const detail = (data as { detail?: unknown }).detail
  return typeof detail === "string" ? detail : null
}

export function PipelineManagerModal({
  triggerLabel = "Pipelines",
  triggerIcon = "settings",
  triggerVariant = "outline",
  triggerClassName,
}: PipelineManagerModalProps) {
  const queryClient = useQueryClient()
  const { pipelines } = useCRM()

  const [open, setOpen] = useState(false)
  const [selectedPipelineId, setSelectedPipelineId] = useState<number | null>(null)

  const [newPipelineName, setNewPipelineName] = useState("")
  const [newPipelineVisibility, setNewPipelineVisibility] = useState<"company" | "group">("company")
  const [newPipelineGroupIds, setNewPipelineGroupIds] = useState<number[]>([])
  const [newGroupName, setNewGroupName] = useState("")
  const [createStep, setCreateStep] = useState<NewPipelineStep>("idle")

  const selectedPipeline = useMemo(
    () => (selectedPipelineId ? pipelines.find((p) => p.id === selectedPipelineId) : pipelines[0]),
    [pipelines, selectedPipelineId]
  )

  const [editPipelineName, setEditPipelineName] = useState("")
  const [editPipelineVisibility, setEditPipelineVisibility] = useState<"company" | "group">("company")
  const [editPipelineGroupIds, setEditPipelineGroupIds] = useState<number[]>([])
  const [newColumnTitle, setNewColumnTitle] = useState("")
  const [newColumnKind, setNewColumnKind] = useState<CRMColumn["column_kind"]>("active")
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null)
  const [columnToDelete, setColumnToDelete] = useState<CRMColumn | null>(null)
  const [columnToConfigure, setColumnToConfigure] = useState<CRMColumn | null>(null)

  const [draftColumnKind, setDraftColumnKind] = useState<CRMColumn["column_kind"]>("active")
  const [draftMarksDone, setDraftMarksDone] = useState(false)
  const [draftRequiresSchedule, setDraftRequiresSchedule] = useState(false)
  const [draftRequiresAssignee, setDraftRequiresAssignee] = useState(false)
  const [draftWipLimit, setDraftWipLimit] = useState("")
  const [draftRestrictOrigins, setDraftRestrictOrigins] = useState(false)
  const [draftAllowedSourceColumns, setDraftAllowedSourceColumns] = useState<number[]>([])

  const groupsQuery = useQuery({
    queryKey: ["crm-groups"],
    queryFn: async () => {
      const res = await api.get<CRMGroup[] | { results: CRMGroup[] }>("/api/crm/groups/")
      return parseListResponse<CRMGroup>(res.data)
    },
    enabled: open,
    staleTime: 30_000,
  })

  const groups = groupsQuery.data ?? []

  useEffect(() => {
    if (!open) return
    if (!selectedPipelineId && pipelines[0]?.id) {
      setSelectedPipelineId(pipelines[0].id)
    }
  }, [open, pipelines, selectedPipelineId])

  useEffect(() => {
    setEditPipelineName(selectedPipeline?.name || "")
  }, [selectedPipeline?.id, selectedPipeline?.name])

  useEffect(() => {
    if (!selectedPipeline) return
    setEditPipelineVisibility(selectedPipeline.visibility || "company")
    setEditPipelineGroupIds(Array.isArray(selectedPipeline.groups) ? selectedPipeline.groups : [])
  }, [selectedPipeline])

  useEffect(() => {
    if (!columnToConfigure) return
    setDraftColumnKind(columnToConfigure.column_kind || "active")
    setDraftMarksDone(Boolean(columnToConfigure.marks_done))
    setDraftRequiresSchedule(Boolean(columnToConfigure.requires_schedule))
    setDraftRequiresAssignee(Boolean(columnToConfigure.requires_assignee))
    const allowed =
      Array.isArray(columnToConfigure.allowed_source_columns)
        ? columnToConfigure.allowed_source_columns.filter((value) => typeof value === "number")
        : []
    setDraftAllowedSourceColumns(allowed)
    setDraftRestrictOrigins(allowed.length > 0)
    setDraftWipLimit(
      typeof columnToConfigure.wip_limit === "number" && Number.isFinite(columnToConfigure.wip_limit)
        ? String(columnToConfigure.wip_limit)
        : ""
    )
  }, [columnToConfigure])

  const createGroup = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const response = await api.post<CRMGroup>("/api/crm/groups/", payload)
      return response.data
    },
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: ["crm-groups"] })
      setNewGroupName("")
      if (newPipelineVisibility === "group") {
        setNewPipelineGroupIds((current) => (current.includes(group.id) ? current : [...current, group.id]))
      }
      toast.success("Grupo criado!")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível criar o grupo.")
    },
  })

  const createPipeline = useMutation({
    mutationFn: async (payload: { name: string; visibility: "company" | "group"; groups: number[] }) => {
      const response = await api.post<Pipeline>("/api/crm/pipelines/", payload)
      return response.data
    },
    onSuccess: async (pipeline) => {
      setCreateStep("creating_columns")
      const payloads = getDefaultColumnsPayload(pipeline.id)
      for (const payload of payloads) {
        await api.post("/api/crm/columns/", payload)
      }

      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      toast.success("Pipeline criado com sucesso!")
      setNewPipelineName("")
      setNewPipelineVisibility("company")
      setNewPipelineGroupIds([])
      setSelectedPipelineId(pipeline.id)
      setCreateStep("idle")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível criar o pipeline.")
      setCreateStep("idle")
    },
  })

  const updatePipeline = useMutation({
    mutationFn: async (payload: { id: number; name: string; visibility: "company" | "group"; groups: number[] }) => {
      const response = await api.patch<Pipeline>(`/api/crm/pipelines/${payload.id}/`, {
        name: payload.name,
        visibility: payload.visibility,
        groups: payload.visibility === "group" ? payload.groups : [],
      })
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      toast.success("Pipeline atualizado!")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível atualizar o pipeline.")
    },
  })

  const deletePipeline = useMutation({
    mutationFn: async (pipelineId: number) => {
      await api.delete(`/api/crm/pipelines/${pipelineId}/`)
      return pipelineId
    },
    onSuccess: async (pipelineId) => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      await queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      toast.success("Pipeline excluído!")
      setSelectedPipelineId((current) => (current === pipelineId ? null : current))
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível excluir o pipeline.")
    },
  })

  const updateColumn = useMutation({
    mutationFn: async (payload: { id: number; title: string }) => {
      const response = await api.patch(`/api/crm/columns/${payload.id}/`, { title: payload.title })
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      await queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      toast.success("Coluna atualizada!")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível atualizar a coluna.")
    },
  })

  const updateColumnSettings = useMutation({
    mutationFn: async (payload: {
      id: number
      column_kind: CRMColumn["column_kind"]
      marks_done: boolean
      requires_schedule: boolean
      requires_assignee: boolean
      wip_limit: number | null
      allowed_source_columns: number[]
    }) => {
      const response = await api.patch(`/api/crm/columns/${payload.id}/`, {
        column_kind: payload.column_kind,
        marks_done: payload.marks_done,
        requires_schedule: payload.requires_schedule,
        requires_assignee: payload.requires_assignee,
        wip_limit: payload.wip_limit,
        allowed_source_columns: payload.allowed_source_columns,
      })
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      await queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      toast.success("Configurações da coluna atualizadas!")
      setColumnToConfigure(null)
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível atualizar as configurações da coluna.")
    },
  })

  const reorderColumns = useMutation({
    mutationFn: async (payload: { columns: { id: number; order: number }[] }) => {
      for (const item of payload.columns) {
        await api.patch(`/api/crm/columns/${item.id}/`, { order: item.order })
      }
      return payload
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      await queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      toast.success("Ordem das colunas atualizada!")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível reordenar as colunas.")
    },
  })

  const createColumn = useMutation({
    mutationFn: async (payload: { pipeline: number; title: string; order: number; column_kind: CRMColumn["column_kind"] }) => {
      const response = await api.post("/api/crm/columns/", payload)
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      toast.success("Coluna criada!")
      setNewColumnTitle("")
      setNewColumnKind("active")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível criar a coluna.")
    },
  })

  const applyITILTemplate = useMutation({
    mutationFn: async (pipelineId: number) => {
      const response = await api.post(`/api/crm/pipelines/${pipelineId}/apply_itil_template/`)
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      toast.success("Template ITIL v5 aplicado com sucesso!")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível aplicar o template.")
    },
  })

  const deleteColumn = useMutation({
    mutationFn: async (columnId: number) => {
      await api.delete(`/api/crm/columns/${columnId}/`)
      return columnId
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      await queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      toast.success("Coluna excluída!")
    },
    onError: (err: unknown) => {
      toast.error(getErrorDetail(err) || "Não foi possível excluir a coluna.")
    },
  })

  const canCreatePipeline =
    newPipelineName.trim().length >= 2 &&
    createStep === "idle" &&
    !createPipeline.isPending &&
    (newPipelineVisibility !== "group" || newPipelineGroupIds.length > 0)

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant={triggerVariant}
            className={[
              triggerVariant === "outline" || triggerVariant === "ghost" ? "glass" : "",
              triggerClassName,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {triggerIcon === "plus" ? <Plus className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            <span>{triggerLabel}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[900px] max-h-[calc(100vh-1.5rem)] glass overflow-hidden grid grid-rows-[auto_1fr]">
          <DialogHeader>
            <DialogTitle>Gerenciar Pipelines</DialogTitle>
            <DialogDescription>
              Crie novos fluxos e edite o nome das colunas. As alterações refletem no Kanban e na Tabela.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto pt-4">
            <div className="grid gap-6 md:grid-cols-[360px_1fr]">
            <div className="rounded-3xl border bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Novo pipeline</h3>
                <Badge variant="secondary" className="rounded-full">
                  {pipelines.length}
                </Badge>
              </div>

              <div className="mt-4 space-y-3">
                <Input
                  value={newPipelineName}
                  onChange={(e) => setNewPipelineName(e.target.value)}
                  placeholder="Ex: Suporte TI"
                  className="glass"
                />
                <Select value={newPipelineVisibility} onValueChange={(value) => setNewPipelineVisibility(value as "company" | "group")}>
                  <SelectTrigger className="glass">
                    <SelectValue placeholder="Visibilidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company">Empresa (todos)</SelectItem>
                    <SelectItem value="group">Por Grupo</SelectItem>
                  </SelectContent>
                </Select>

                {newPipelineVisibility === "group" ? (
                  <div className="rounded-2xl border bg-background/40 p-3 space-y-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Grupos com acesso
                    </div>
                    {groups.length ? (
                      <ScrollArea className="h-[160px] pr-3">
                        <div className="space-y-2">
                          {groups.map((group) => {
                            const checked = newPipelineGroupIds.includes(group.id)
                            return (
                              <label key={group.id} className="flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2 cursor-pointer">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    const next = Boolean(value)
                                    setNewPipelineGroupIds((current) => {
                                      if (next) return current.includes(group.id) ? current : [...current, group.id]
                                      return current.filter((id) => id !== group.id)
                                    })
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold truncate">{group.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{group.slug}</div>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Nenhum grupo criado ainda.
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Criar novo grupo (ex: Suporte)"
                        className="glass"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="glass w-full"
                        disabled={newGroupName.trim().length < 2 || createGroup.isPending}
                        onClick={() => createGroup.mutate({ name: newGroupName.trim() })}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar grupo
                      </Button>
                    </div>
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  disabled={!canCreatePipeline}
                  onClick={() => {
                    if (newPipelineVisibility === "group" && newPipelineGroupIds.length === 0) {
                      toast.error("Selecione ao menos um grupo para criar uma pipeline por grupo.")
                      return
                    }
                    setCreateStep("creating")
                    createPipeline.mutate({
                      name: newPipelineName.trim(),
                      visibility: newPipelineVisibility,
                      groups: newPipelineVisibility === "group" ? newPipelineGroupIds : [],
                    })
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {createStep === "creating_columns" ? "Criando colunas..." : "Criar pipeline"}
                </Button>
              </div>

              <div className="mt-6 h-px bg-border/60" />

              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline selecionado</h3>

                <Select
                  value={selectedPipeline?.id?.toString() || ""}
                  onValueChange={(value) => setSelectedPipelineId(Number(value))}
                >
                  <SelectTrigger className="glass">
                    <SelectValue placeholder="Selecione um pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline.id} value={pipeline.id.toString()}>
                        {pipeline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="grid gap-2">
                  <Input
                    value={editPipelineName}
                    onChange={(e) => setEditPipelineName(e.target.value)}
                    placeholder="Nome do pipeline"
                    className="glass"
                    disabled={!selectedPipeline}
                  />
                  <Select
                    value={editPipelineVisibility}
                    onValueChange={(value) => setEditPipelineVisibility(value as "company" | "group")}
                    disabled={!selectedPipeline}
                  >
                    <SelectTrigger className="glass">
                      <SelectValue placeholder="Visibilidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Empresa (todos)</SelectItem>
                      <SelectItem value="group">Por Grupo</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedPipeline && editPipelineVisibility === "group" ? (
                    <div className="rounded-2xl border bg-background/40 p-3 space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Grupos com acesso
                      </div>
                      {groups.length ? (
                        <ScrollArea className="h-[160px] pr-3">
                          <div className="space-y-2">
                            {groups.map((group) => {
                              const checked = editPipelineGroupIds.includes(group.id)
                              return (
                                <label key={group.id} className="flex items-center gap-3 rounded-xl border bg-card/40 px-3 py-2 cursor-pointer">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) => {
                                      const next = Boolean(value)
                                      setEditPipelineGroupIds((current) => {
                                        if (next) return current.includes(group.id) ? current : [...current, group.id]
                                        return current.filter((id) => id !== group.id)
                                      })
                                    }}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold truncate">{group.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{group.slug}</div>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Nenhum grupo criado ainda.
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="flex-1"
                      disabled={!selectedPipeline || editPipelineName.trim().length < 2 || updatePipeline.isPending}
                      onClick={() => {
                        if (!selectedPipeline) return
                        if (editPipelineVisibility === "group" && editPipelineGroupIds.length === 0) {
                          toast.error("Selecione ao menos um grupo para salvar uma pipeline por grupo.")
                          return
                        }
                        updatePipeline.mutate({
                          id: selectedPipeline.id,
                          name: editPipelineName.trim(),
                          visibility: editPipelineVisibility,
                          groups: editPipelineVisibility === "group" ? editPipelineGroupIds : [],
                        })
                      }}
                    >
                      Salvar
                    </Button>
                    <Button
                      variant="outline"
                      className="glass border-primary/20 text-primary font-bold px-3"
                      title="Aplicar Template ITIL v5"
                      disabled={!selectedPipeline || applyITILTemplate.isPending}
                      onClick={() => {
                        if (!selectedPipeline) return
                        applyITILTemplate.mutate(selectedPipeline.id)
                      }}
                    >
                      <Rocket className="h-4 w-4 mr-2" />
                      ITIL v5
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={!selectedPipeline || deletePipeline.isPending}
                      onClick={() => {
                        if (!selectedPipeline) return
                        setPipelineToDelete(selectedPipeline)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Colunas</h3>
                <Badge variant="outline" className="rounded-full">
                  {selectedPipeline?.columns?.length || 0}
                </Badge>
              </div>

              {!selectedPipeline ? (
                <div className="mt-6 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                  Selecione um pipeline para editar suas colunas.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3">
                    {(selectedPipeline.columns || [])
                      .slice()
                      .sort((a, b) => a.order - b.order || a.id - b.id)
                      .map((column, index, all) => (
                        <div key={column.id} className="rounded-2xl border bg-background/40 p-3 grid gap-3 sm:flex sm:items-center sm:gap-2">
                          <div className="flex items-center justify-between gap-2 sm:justify-start">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="rounded-full w-12 justify-center">
                                {column.order}
                              </Badge>
                              <div className="flex gap-1 sm:flex-col">
                                <Button
                                  variant="outline"
                                  size="icon-xs"
                                  className="glass"
                                  disabled={index === 0 || reorderColumns.isPending}
                                  onClick={() => {
                                    const ordered = all.slice()
                                    const swapIndex = index - 1
                                    ;[ordered[swapIndex], ordered[index]] = [ordered[index], ordered[swapIndex]]
                                    reorderColumns.mutate({
                                      columns: ordered.map((item, idx) => ({ id: item.id, order: idx })),
                                    })
                                  }}
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon-xs"
                                  className="glass"
                                  disabled={index === all.length - 1 || reorderColumns.isPending}
                                  onClick={() => {
                                    const ordered = all.slice()
                                    const swapIndex = index + 1
                                    ;[ordered[swapIndex], ordered[index]] = [ordered[index], ordered[swapIndex]]
                                    reorderColumns.mutate({
                                      columns: ordered.map((item, idx) => ({ id: item.id, order: idx })),
                                    })
                                  }}
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 sm:hidden">
                              <Button
                                variant="outline"
                                className="glass"
                                onClick={() => setColumnToConfigure(column)}
                                disabled={updateColumnSettings.isPending}
                              >
                                <Settings2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                className="glass"
                                disabled={deleteColumn.isPending}
                                onClick={() => setColumnToDelete(column)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <Input
                            defaultValue={column.title}
                            className="glass w-full sm:flex-1"
                            onBlur={(e) => {
                              const nextTitle = e.currentTarget.value.trim()
                              if (!nextTitle || nextTitle === column.title) {
                                e.currentTarget.value = column.title
                                return
                              }
                              updateColumn.mutate({ id: column.id, title: nextTitle })
                            }}
                          />

                          <div className="hidden sm:flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="glass"
                              onClick={() => setColumnToConfigure(column)}
                              disabled={updateColumnSettings.isPending}
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              className="glass"
                              disabled={deleteColumn.isPending}
                              onClick={() => setColumnToDelete(column)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="h-px bg-border/60" />

                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <Input
                      value={newColumnTitle}
                      onChange={(e) => setNewColumnTitle(e.target.value)}
                      placeholder="Nova coluna (título)"
                      className="glass flex-1"
                    />
                    <Select value={newColumnKind} onValueChange={(value) => setNewColumnKind(value as CRMColumn["column_kind"])}>
                      <SelectTrigger className="glass md:w-[180px]">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="backlog">Novo</SelectItem>
                        <SelectItem value="planned">Planejado</SelectItem>
                        <SelectItem value="active">Em Andamento</SelectItem>
                        <SelectItem value="done">Concluído</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      disabled={newColumnTitle.trim().length < 2 || createColumn.isPending}
                      onClick={() => {
                        if (!selectedPipeline) return
                        const maxOrder = Math.max(-1, ...(selectedPipeline.columns || []).map((c) => c.order))
                        createColumn.mutate({
                          pipeline: selectedPipeline.id,
                          title: newColumnTitle.trim(),
                          order: maxOrder + 1,
                          column_kind: newColumnKind,
                        })
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!columnToConfigure} onOpenChange={(nextOpen) => !nextOpen && setColumnToConfigure(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[560px] max-h-[calc(100vh-1.5rem)] glass overflow-hidden grid grid-rows-[auto_1fr]">
          <DialogHeader>
            <DialogTitle>Configurar coluna</DialogTitle>
            <DialogDescription>
              Ajuste as regras desta etapa. Isso influencia validações e o cálculo automático de progresso.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto">
            <div className="grid gap-4 pt-2">
            {(() => {
              const orderedColumns = (selectedPipeline?.columns || []).slice().sort((a, b) => a.order - b.order || a.id - b.id)
              const currentIndex = columnToConfigure ? orderedColumns.findIndex((column) => column.id === columnToConfigure.id) : -1
              const previousColumn = currentIndex > 0 ? orderedColumns[currentIndex - 1] : null
              const previousColumns = currentIndex > 0 ? orderedColumns.slice(0, currentIndex) : []
              const allExceptDone = orderedColumns.filter((column) => columnToConfigure && column.id !== columnToConfigure.id && !column.marks_done && column.column_kind !== "done")

              return (
                <>
            <div className="grid gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tipo</div>
              <Select value={draftColumnKind} onValueChange={(value) => setDraftColumnKind(value as CRMColumn["column_kind"])}>
                <SelectTrigger className="glass">
                  <SelectValue placeholder="Selecione um tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Novo</SelectItem>
                  <SelectItem value="planned">Planejado</SelectItem>
                  <SelectItem value="active">Em Andamento</SelectItem>
                  <SelectItem value="done">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 rounded-2xl border bg-card/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">Exigir agendamento</div>
                  <div className="text-sm text-muted-foreground">Força preenchimento de data ao mover para esta coluna.</div>
                </div>
                <Switch checked={draftRequiresSchedule} onCheckedChange={setDraftRequiresSchedule} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">Exigir técnico</div>
                  <div className="text-sm text-muted-foreground">Força atribuição de técnico ao mover para esta coluna.</div>
                </div>
                <Switch checked={draftRequiresAssignee} onCheckedChange={setDraftRequiresAssignee} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">Marcar como concluído</div>
                  <div className="text-sm text-muted-foreground">Fecha o card ao entrar nesta coluna.</div>
                </div>
                <Switch checked={draftMarksDone || draftColumnKind === "done"} onCheckedChange={setDraftMarksDone} disabled={draftColumnKind === "done"} />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Limite WIP</div>
              <Input
                value={draftWipLimit}
                onChange={(e) => setDraftWipLimit(e.target.value)}
                placeholder="Ex: 10 (vazio para ilimitado)"
                className="glass"
                inputMode="numeric"
              />
            </div>

            <div className="grid gap-3 rounded-2xl border bg-card/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">Restringir origem</div>
                  <div className="text-sm text-muted-foreground">
                    Defina de quais colunas este card pode vir. Se desligado, aceita de todas.
                  </div>
                </div>
                <Switch
                  checked={draftRestrictOrigins}
                  onCheckedChange={(checked) => {
                    setDraftRestrictOrigins(checked)
                    if (!checked) setDraftAllowedSourceColumns([])
                  }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="glass"
                  onClick={() => {
                    setDraftRestrictOrigins(false)
                    setDraftAllowedSourceColumns([])
                  }}
                >
                  Livre
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="glass"
                  disabled={!previousColumn}
                  onClick={() => {
                    if (!previousColumn) return
                    setDraftRestrictOrigins(true)
                    setDraftAllowedSourceColumns([previousColumn.id])
                  }}
                >
                  Só anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="glass"
                  disabled={previousColumns.length === 0}
                  onClick={() => {
                    setDraftRestrictOrigins(true)
                    setDraftAllowedSourceColumns(previousColumns.map((column) => column.id))
                  }}
                >
                  Todas anteriores
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="glass"
                  disabled={allExceptDone.length === 0}
                  onClick={() => {
                    setDraftRestrictOrigins(true)
                    setDraftAllowedSourceColumns(allExceptDone.map((column) => column.id))
                  }}
                >
                  Exceto concluídas
                </Button>
              </div>

              {draftRestrictOrigins ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Origens permitidas
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="glass"
                      onClick={() => setDraftAllowedSourceColumns([])}
                    >
                      Limpar
                    </Button>
                  </div>

                  <div className="grid gap-2">
                    {(selectedPipeline?.columns || [])
                      .slice()
                      .sort((a, b) => a.order - b.order || a.id - b.id)
                      .filter((column) => columnToConfigure && column.id !== columnToConfigure.id)
                      .map((column) => {
                        const checked = draftAllowedSourceColumns.includes(column.id)
                        return (
                          <button
                            key={column.id}
                            type="button"
                            className="flex items-center gap-3 rounded-xl border bg-background/40 px-3 py-2 text-left"
                            onClick={() => {
                              setDraftAllowedSourceColumns((current) => {
                                if (current.includes(column.id)) {
                                  return current.filter((value) => value !== column.id)
                                }
                                return [...current, column.id]
                              })
                            }}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => {}} />
                            <div className="flex-1">
                              <div className="text-sm font-semibold">{column.title}</div>
                            </div>
                          </button>
                        )
                      })}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Aceita cards vindos de qualquer coluna.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" className="glass" onClick={() => setColumnToConfigure(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!columnToConfigure || updateColumnSettings.isPending}
                onClick={() => {
                  if (!columnToConfigure) return
                  const numericWip = draftWipLimit.trim() === "" ? null : Number(draftWipLimit)
                  const wipLimit = Number.isFinite(numericWip) ? numericWip : null

                  const isDone = draftColumnKind === "done" ? true : draftMarksDone
                  const pipelineColumnIds = new Set((selectedPipeline?.columns || []).map((column) => column.id))
                  const allowedSources = draftAllowedSourceColumns.filter((columnId) => pipelineColumnIds.has(columnId))
                  updateColumnSettings.mutate({
                    id: columnToConfigure.id,
                    column_kind: draftColumnKind,
                    marks_done: isDone,
                    requires_schedule: draftRequiresSchedule,
                    requires_assignee: draftRequiresAssignee,
                    wip_limit: wipLimit,
                    allowed_source_columns: draftRestrictOrigins ? allowedSources : [],
                  })
                }}
              >
                Salvar
              </Button>
            </div>
                </>
              )
            })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pipelineToDelete} onOpenChange={(nextOpen) => !nextOpen && setPipelineToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pipeline</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se existirem cards vinculados, o sistema pode impedir a exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePipeline.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deletePipeline.isPending}
              onClick={() => {
                if (!pipelineToDelete) return
                deletePipeline.mutate(pipelineToDelete.id)
                setPipelineToDelete(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!columnToDelete} onOpenChange={(nextOpen) => !nextOpen && setColumnToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coluna</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Se existirem cards vinculados, o sistema pode impedir a exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteColumn.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteColumn.isPending}
              onClick={() => {
                if (!columnToDelete) return
                deleteColumn.mutate(columnToDelete.id)
                setColumnToDelete(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
