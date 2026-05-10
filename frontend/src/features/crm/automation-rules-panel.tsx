"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Zap, Power, PowerOff, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { api } from "@/lib/axios"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface AutomationRule {
  id: number
  name: string
  is_active: boolean
  pipeline: number | null
  trigger: string
  trigger_display: string
  conditions: Record<string, string>
  action: string
  action_display: string
  action_config: Record<string, unknown>
  execution_count: number
  last_triggered_at: string | null
}

const TRIGGERS = [
  { value: "deal_created", label: "Card criado" },
  { value: "deal_moved", label: "Card movido de coluna" },
  { value: "sla_breached", label: "SLA violado" },
  { value: "deal_closed", label: "Card fechado" },
]

const ACTIONS = [
  { value: "notify_assignee", label: "Notificar responsável" },
  { value: "send_webhook", label: "Enviar webhook externo" },
  { value: "assign_user", label: "Atribuir usuário" },
  { value: "create_notification", label: "Notificar usuário específico" },
]

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]
const RECORD_TYPES = ["incident", "service_request", "change", "problem"]

interface AutomationRulesPanelProps {
  pipelineId: number
}

export function AutomationRulesPanel({ pipelineId }: AutomationRulesPanelProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: "",
    trigger: "deal_created",
    action: "notify_assignee",
    conditionPriority: "",
    conditionRecordType: "",
    actionWebhookUrl: "",
    actionUserId: "",
    actionTitle: "",
    actionMessage: "",
  })

  const { data: rules = [], isLoading } = useQuery<AutomationRule[]>({
    queryKey: ["crm-automation-rules", pipelineId],
    queryFn: async () => {
      const res = await api.get("/api/crm/automation-rules/", { params: { pipeline: pipelineId } })
      return Array.isArray(res.data) ? res.data : (res.data?.results ?? [])
    },
  })

  const createRule = useMutation({
    mutationFn: async () => {
      const conditions: Record<string, string> = {}
      if (form.conditionPriority) conditions.priority = form.conditionPriority
      if (form.conditionRecordType) conditions.record_type = form.conditionRecordType

      const actionConfig: Record<string, unknown> = {}
      if (form.action === "send_webhook") actionConfig.url = form.actionWebhookUrl
      if (form.action === "assign_user") actionConfig.user_id = Number(form.actionUserId)
      if (form.action === "create_notification") {
        actionConfig.user_id = Number(form.actionUserId)
        actionConfig.title = form.actionTitle
        actionConfig.message = form.actionMessage
      }

      return api.post("/api/crm/automation-rules/", {
        name: form.name,
        pipeline: pipelineId,
        trigger: form.trigger,
        action: form.action,
        conditions,
        action_config: actionConfig,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules", pipelineId] })
      setOpen(false)
      setForm({ name: "", trigger: "deal_created", action: "notify_assignee", conditionPriority: "", conditionRecordType: "", actionWebhookUrl: "", actionUserId: "", actionTitle: "", actionMessage: "" })
      toast.success("Regra criada com sucesso!")
    },
    onError: () => toast.error("Erro ao criar regra."),
  })

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.patch(`/api/crm/automation-rules/${id}/`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-automation-rules", pipelineId] }),
  })

  const deleteRule = useMutation({
    mutationFn: async (id: number) => api.delete(`/api/crm/automation-rules/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automation-rules", pipelineId] })
      toast.success("Regra removida.")
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">Automações</h3>
          <Badge variant="secondary" className="text-[10px] font-black uppercase tracking-widest">
            {rules.length}
          </Badge>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="h-9 gap-2 rounded-xl text-xs font-black uppercase tracking-widest">
          <Plus className="h-4 w-4" />
          Nova Regra
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border/50 p-8 text-center">
          <Zap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma automação configurada.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Crie regras para automatizar ações quando eventos ocorrem nos cards.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={cn(
                "flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors",
                rule.is_active ? "bg-card border-border" : "bg-muted/20 border-border/40 opacity-60"
              )}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-sm truncate">{rule.name}</p>
                  {!rule.is_active && (
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      Pausada
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground/70">{rule.trigger_display}</span>
                  {" → "}
                  <span className="font-semibold text-primary/70">{rule.action_display}</span>
                </p>
                {rule.execution_count > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-widest">
                    Executada {rule.execution_count}x
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={(v) => toggleRule.mutate({ id: rule.id, is_active: v })}
                  aria-label={rule.is_active ? "Pausar regra" : "Ativar regra"}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-rose-500/10 hover:text-rose-500"
                  onClick={() => {
                    if (confirm(`Remover a regra "${rule.name}"?`)) deleteRule.mutate(rule.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Nova Regra de Automação
            </DialogTitle>
            <DialogDescription>
              Configure quando a regra dispara e qual ação executar automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome da regra</Label>
              <Input
                placeholder="ex: Notificar ao mover card"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gatilho (quando)</Label>
                <Select value={form.trigger} onValueChange={(v) => setForm((f) => ({ ...f, trigger: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ação (o quê)</Label>
                <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Condições opcionais</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prioridade</Label>
                  <Select value={form.conditionPriority || "any"} onValueChange={(v) => setForm((f) => ({ ...f, conditionPriority: v === "any" ? "" : v }))}>
                    <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue placeholder="Qualquer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de registro</Label>
                  <Select value={form.conditionRecordType || "any"} onValueChange={(v) => setForm((f) => ({ ...f, conditionRecordType: v === "any" ? "" : v }))}>
                    <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue placeholder="Qualquer" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer</SelectItem>
                      {RECORD_TYPES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {form.action === "send_webhook" && (
              <div className="space-y-1.5">
                <Label>URL do webhook</Label>
                <Input placeholder="https://n8n.example.com/webhook/..." value={form.actionWebhookUrl} onChange={(e) => setForm((f) => ({ ...f, actionWebhookUrl: e.target.value }))} className="rounded-xl" />
              </div>
            )}

            {(form.action === "assign_user" || form.action === "create_notification") && (
              <div className="space-y-1.5">
                <Label>ID do usuário</Label>
                <Input type="number" placeholder="ID do usuário" value={form.actionUserId} onChange={(e) => setForm((f) => ({ ...f, actionUserId: e.target.value }))} className="rounded-xl" />
              </div>
            )}

            {form.action === "create_notification" && (
              <>
                <div className="space-y-1.5">
                  <Label>Título da notificação</Label>
                  <Input placeholder="ex: Card movido!" value={form.actionTitle} onChange={(e) => setForm((f) => ({ ...f, actionTitle: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label>Mensagem</Label>
                  <Input placeholder="ex: O card foi movido para nova coluna." value={form.actionMessage} onChange={(e) => setForm((f) => ({ ...f, actionMessage: e.target.value }))} className="rounded-xl" />
                </div>
              </>
            )}

            <Button
              className="w-full"
              disabled={!form.name || createRule.isPending}
              onClick={() => createRule.mutate()}
            >
              {createRule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Criar Regra
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
