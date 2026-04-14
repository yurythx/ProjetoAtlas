"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Clock3, KanbanSquare, Settings2, Workflow } from "lucide-react"
import { toast } from "sonner"

import { api } from "@/lib/axios"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { getColumnOccupancy, getPipelineColumns, type CRMColumn, type Deal, type Pipeline, resolveColumnSemantics } from "./use-crm"

interface ColumnGovernanceSheetProps {
  pipeline: Pipeline
  deals: Deal[]
}

const COLUMN_KIND_OPTIONS = [
  { value: "backlog", label: "Backlog", description: "Entrada inicial do funil." },
  { value: "planned", label: "Planejada", description: "Exige preparo operacional antes da execução." },
  { value: "active", label: "Em andamento", description: "Trabalho em curso pelo time." },
  { value: "done", label: "Concluída", description: "Entrega finalizada e contabilizada como done." },
  { value: "custom", label: "Customizada", description: "Coluna livre para regras próprias." },
] as const

const GOVERNANCE_PRESETS = [
  {
    id: "backlog",
    label: "Preset Backlog",
    description: "Sem bloqueios, boa para triagem e entrada.",
    icon: KanbanSquare,
    values: {
      column_kind: "backlog" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    },
  },
  {
    id: "planned",
    label: "Preset Planejada",
    description: "Exige agendamento e responsável para entrar.",
    icon: Clock3,
    values: {
      column_kind: "planned" as const,
      marks_done: false,
      requires_schedule: true,
      requires_assignee: true,
    },
  },
  {
    id: "active",
    label: "Preset Execução",
    description: "Fluxo de trabalho ativo sem marcar done.",
    icon: Workflow,
    values: {
      column_kind: "active" as const,
      marks_done: false,
      requires_schedule: false,
      requires_assignee: false,
    },
  },
  {
    id: "done",
    label: "Preset Concluída",
    description: "Marca o card como finalizado ao entrar.",
    icon: CheckCircle2,
    values: {
      column_kind: "done" as const,
      marks_done: true,
      requires_schedule: false,
      requires_assignee: false,
    },
  },
] as const

function normalizeColumnPayload(column: CRMColumn) {
  const semantics = resolveColumnSemantics(column)
  return {
    title: column.title,
    pipeline: column.pipeline,
    order: column.order,
    color: column.color,
    column_kind: semantics.column_kind,
    marks_done: semantics.marks_done,
    requires_schedule: semantics.requires_schedule,
    requires_assignee: semantics.requires_assignee,
    allowed_source_columns: semantics.allowed_source_columns,
    wip_limit: semantics.wip_limit,
    legacy_stage: column.legacy_stage,
  }
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

export function ColumnGovernanceSheet({ pipeline, deals }: ColumnGovernanceSheetProps) {
  const queryClient = useQueryClient()
  const columns = useMemo(() => getPipelineColumns(pipeline), [pipeline])
  const [open, setOpen] = useState(false)
  const [selectedColumnId, setSelectedColumnId] = useState<string>("")
  const [draftWipLimit, setDraftWipLimit] = useState("")
  const [draftRequiresSchedule, setDraftRequiresSchedule] = useState(false)
  const [draftRequiresAssignee, setDraftRequiresAssignee] = useState(false)
  const [draftAllowedSources, setDraftAllowedSources] = useState<number[]>([])
  const [draftColumnKind, setDraftColumnKind] = useState<CRMColumn["column_kind"]>("custom")
  const [draftMarksDone, setDraftMarksDone] = useState(false)

  const selectedColumn = useMemo(
    () => columns.find((column) => column.id.toString() === selectedColumnId) || columns[0],
    [columns, selectedColumnId]
  )

  useEffect(() => {
    if (!columns.length) {
      setSelectedColumnId("")
      return
    }

    setSelectedColumnId((current) => current || columns[0].id.toString())
  }, [columns])

  useEffect(() => {
    if (!selectedColumn) return

    const semantics = resolveColumnSemantics(selectedColumn)
    setDraftWipLimit(semantics.wip_limit ? String(semantics.wip_limit) : "")
    setDraftRequiresSchedule(semantics.requires_schedule)
    setDraftRequiresAssignee(semantics.requires_assignee)
    setDraftAllowedSources(semantics.allowed_source_columns)
    setDraftColumnKind(semantics.column_kind)
    setDraftMarksDone(semantics.marks_done)
  }, [selectedColumn])

  const occupancy = selectedColumn ? getColumnOccupancy(selectedColumn.id, deals, [pipeline]) : 0
  const availableSourceColumns = columns.filter((column) => column.id !== selectedColumn?.id)
  const hasRestrictedSources = draftAllowedSources.length > 0

  const updateColumnGovernance = useMutation({
    mutationFn: async () => {
      if (!selectedColumn) {
        throw new Error("Selecione uma coluna para configurar.")
      }

      const basePayload = normalizeColumnPayload(selectedColumn)
      const numericWipLimit = Number(draftWipLimit)

      const response = await api.patch<CRMColumn>(`/api/crm/columns/${selectedColumn.id}/`, {
        ...basePayload,
        column_kind: draftColumnKind,
        marks_done: draftMarksDone,
        requires_schedule: draftRequiresSchedule,
        requires_assignee: draftRequiresAssignee,
        allowed_source_columns: draftAllowedSources,
        wip_limit: draftWipLimit.trim() && Number.isFinite(numericWipLimit) && numericWipLimit > 0 ? Math.round(numericWipLimit) : null,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      queryClient.invalidateQueries({ queryKey: ["crm-pipeline-overview", pipeline.id] })
      toast.success("Governança da coluna atualizada!")
    },
    onError: (error: unknown) => {
      toast.error(getErrorDetail(error) || "Não foi possível atualizar a governança da coluna.")
    },
  })

  const handleToggleAllowedSource = (columnId: number, checked: boolean) => {
    setDraftAllowedSources((current) =>
      checked ? [...current, columnId].sort((a, b) => a - b) : current.filter((item) => item !== columnId)
    )
  }

  const currentPreset = GOVERNANCE_PRESETS.find(
    (preset) =>
      preset.values.column_kind === draftColumnKind &&
      preset.values.marks_done === draftMarksDone &&
      preset.values.requires_schedule === draftRequiresSchedule &&
      preset.values.requires_assignee === draftRequiresAssignee
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Governança das colunas
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[920px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 glass grid grid-rows-[auto_1fr]">
        <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
          <DialogTitle>Governança do board</DialogTitle>
          <DialogDescription>
            Configure limite WIP, origens permitidas e obrigatoriedades operacionais das colunas do pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 h-full overflow-y-auto">
          <div className="space-y-6 p-4 sm:p-6">
            <section className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coluna</p>
                  <Select value={selectedColumn?.id.toString()} onValueChange={setSelectedColumnId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((column) => (
                        <SelectItem key={column.id} value={column.id.toString()}>
                          {column.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedColumn && (
                  <div className="rounded-2xl border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{selectedColumn.title}</Badge>
                      <Badge variant="outline">{resolveColumnSemantics(selectedColumn).column_kind}</Badge>
                      {resolveColumnSemantics(selectedColumn).wip_limit ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            occupancy >= (resolveColumnSemantics(selectedColumn).wip_limit || 0) && "border-amber-300 bg-amber-50 text-amber-800"
                          )}
                        >
                          WIP {occupancy}/{resolveColumnSemantics(selectedColumn).wip_limit}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Sem limite WIP</Badge>
                      )}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Use este painel para definir quando a coluna aceita novos cards e quais dados são obrigatórios ao entrar nela.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {selectedColumn && (
              <>
                <section className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Capacidade</h3>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Defina um limite operacional para evitar superlotação da coluna.
                    </p>
                    <Input
                      type="number"
                      min={1}
                      value={draftWipLimit}
                      onChange={(event) => setDraftWipLimit(event.target.value)}
                      placeholder="Sem limite"
                      className="mt-4 max-w-[180px]"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">Deixe vazio para permitir qualquer volume.</p>
                  </div>

                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Workflow className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Semântica e obrigatórios</h3>
                    </div>
                    <div className="mt-4 space-y-4">
                      <div className="rounded-xl border bg-background p-3">
                        <p className="text-sm font-medium">Tipo da coluna</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Determina a intenção operacional da coluna no board.
                        </p>
                        <Select value={draftColumnKind || "custom"} onValueChange={(value) => setDraftColumnKind(value as CRMColumn["column_kind"])}>
                          <SelectTrigger className="mt-3">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            {COLUMN_KIND_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {COLUMN_KIND_OPTIONS.find((option) => option.value === draftColumnKind)?.description}
                        </p>
                      </div>

                      <label className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
                        <div>
                          <p className="text-sm font-medium">Marcar como concluída</p>
                          <p className="text-xs text-muted-foreground">Ao entrar nesta coluna, o card passa a contar como done.</p>
                        </div>
                        <Switch checked={draftMarksDone} onCheckedChange={setDraftMarksDone} />
                      </label>

                      <label className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
                        <div>
                          <p className="text-sm font-medium">Exigir agendamento</p>
                          <p className="text-xs text-muted-foreground">Bloqueia entrada sem `data_agendamento`.</p>
                        </div>
                        <Switch checked={draftRequiresSchedule} onCheckedChange={setDraftRequiresSchedule} />
                      </label>

                      <label className="flex items-center justify-between gap-4 rounded-xl border bg-background p-3">
                        <div>
                          <p className="text-sm font-medium">Exigir responsável técnico</p>
                          <p className="text-xs text-muted-foreground">Bloqueia entrada sem `tecnico_responsavel`.</p>
                        </div>
                        <Switch checked={draftRequiresAssignee} onCheckedChange={setDraftRequiresAssignee} />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Resumo da política</h3>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-xl border bg-background p-3">
                        <span className="font-medium">Preset atual:</span>{" "}
                        {currentPreset ? currentPreset.label : "personalizado"}
                      </div>
                      <div className="rounded-xl border bg-background p-3">
                        <span className="font-medium">Semântica:</span>{" "}
                        {COLUMN_KIND_OPTIONS.find((option) => option.value === draftColumnKind)?.label || "Customizada"}
                        {draftMarksDone ? " com done automático" : ""}
                      </div>
                      <div className="rounded-xl border bg-background p-3">
                        <span className="font-medium">Origens permitidas:</span>{" "}
                        {hasRestrictedSources ? `${draftAllowedSources.length} coluna(s)` : "todas"}
                      </div>
                      <div className="rounded-xl border bg-background p-3">
                        <span className="font-medium">WIP:</span>{" "}
                        {draftWipLimit.trim() ? draftWipLimit : "ilimitado"}
                      </div>
                      <div className="rounded-xl border bg-background p-3">
                        <span className="font-medium">Obrigatórios:</span>{" "}
                        {[draftRequiresSchedule && "agendamento", draftRequiresAssignee && "responsável"].filter(Boolean).join(", ") || "nenhum"}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Presets operacionais</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Aplique um preset para preencher a semântica base da coluna e depois ajuste os detalhes finos conforme o fluxo do time.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {GOVERNANCE_PRESETS.map((preset) => {
                      const Icon = preset.icon
                      const isActive = currentPreset?.id === preset.id

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setDraftColumnKind(preset.values.column_kind)
                            setDraftMarksDone(preset.values.marks_done)
                            setDraftRequiresSchedule(preset.values.requires_schedule)
                            setDraftRequiresAssignee(preset.values.requires_assignee)
                          }}
                          className={cn(
                            "rounded-2xl border p-4 text-left transition-colors",
                            isActive ? "border-primary/40 bg-primary/5" : "bg-background hover:bg-muted/40"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            <p className="text-sm font-semibold">{preset.label}</p>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{preset.description}</p>
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Transições permitidas</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Se nenhuma origem for marcada, a coluna aceita cards vindos de qualquer outra coluna do pipeline.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center gap-3 rounded-xl border bg-background p-3">
                      <Checkbox
                        checked={!hasRestrictedSources}
                        onCheckedChange={(checked) => {
                          if (checked) setDraftAllowedSources([])
                        }}
                      />
                      <div>
                        <p className="text-sm font-medium">Permitir todas as origens</p>
                        <p className="text-xs text-muted-foreground">Modo mais flexível para boards operacionais simples.</p>
                      </div>
                    </label>

                    <div className="grid gap-3 md:grid-cols-2">
                      {availableSourceColumns.map((column) => {
                        const checked = draftAllowedSources.includes(column.id)
                        return (
                          <label
                            key={column.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                              checked ? "border-primary/30 bg-primary/5" : "bg-background/70 hover:bg-muted/40"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onClick={(event) => {
                                event.preventDefault()
                                handleToggleAllowedSource(column.id, !checked)
                              }}
                              onCheckedChange={(value) => handleToggleAllowedSource(column.id, value === true)}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{column.title}</p>
                                <Badge variant="outline">{getColumnOccupancy(column.id, deals, [pipeline])} cards</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Permite mover cards desta coluna para <strong>{selectedColumn.title}</strong>. Use isso para guiar o fluxo ideal do board.
                              </p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </section>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Fechar
                  </Button>
                  <Button onClick={() => updateColumnGovernance.mutate()} disabled={updateColumnGovernance.isPending}>
                    Salvar política
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
