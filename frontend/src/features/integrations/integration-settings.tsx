"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { notify } from "@/lib/notifications"
import { AxiosError } from "axios"
import { usePermission } from "@/hooks/use-permission"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, Copy, KeyRound, PlugZap, RefreshCw, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
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
import { EvolutionConfigPanel } from "@/features/crm/evolution-config-panel"

type ApiKey = {
  id: number
  name: string
  prefix: string
  raw_key?: string
  scopes: string[]
  is_active: boolean
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

type TenantModule = {
  id: number
  module_code: string
  module_name: string
  is_active: boolean
  config: Record<string, unknown>
}

type IntegrationOptions = {
  pipelines: Array<{ id: number; name: string }>
  columns: Array<{ id: number; pipeline: number; title: string; order: number; marks_done: boolean }>
  users: Array<{ id: number; username: string; display_name: string }>
  contacts: Array<{ id: number; name: string; email?: string | null }>
}

type InboundEvent = {
  id: number
  source: string
  event_type: string
  external_id: string
  status: "received" | "processed" | "failed"
  response_status_code: number | null
  error: string | null
  replayed_from_id?: number | null
  processed_deal_id: number | null
  processed_deal_title: string | null
  created_at: string
}

const RECOMMENDED_SCOPES = ["crm.glpi_ticket", "crm.sync_card"] as const
const GLPI_PIPELINE_DEFAULT = "__tenant_default__"
const GLPI_COLUMN_DEFAULT = "__first_column__"
const GLPI_OWNER_DEFAULT = "__default_owner__"
const GLPI_TECNICO_NONE = "__no_tecnico__"
const GLPI_CONTACT_AUTO = "__auto_contact__"

function formatMaybeDate(value: string | null) {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value)
}

function normalizeListResponse<T>(data: T[] | { results?: T[] } | undefined): T[] {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  return Math.trunc(parsed)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function getGlpiIntegrationConfig(config: unknown) {
  if (!isRecord(config)) return {}
  const integration = config.integration
  if (!isRecord(integration)) return {}
  const glpi = integration.glpi
  if (!isRecord(glpi)) return {}
  return glpi as Record<string, unknown>
}

export function IntegrationSettings() {
  const queryClient = useQueryClient()
  const { hasPermission } = usePermission()
  const canManageIntegrations = hasPermission("admin.settings_manage")
  const canManageApiKeys = hasPermission("settings.api_keys_manage")

  const [createOpen, setCreateOpen] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [keyName, setKeyName] = useState("Integração n8n (GLPI)")
  const [scopes, setScopes] = useState<string[]>([...RECOMMENDED_SCOPES])
  const openUnauthorized = (message: string) => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("app-unauthorized", { detail: { message } }))
  }

  const companySlug = useMemo(() => {
    if (typeof window === "undefined") return ""
    return window.localStorage.getItem("companySlug") || ""
  }, [])

  const backendUrl = useMemo(() => {
    if (typeof window === "undefined") return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005"
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005"
  }, [])

  const glpiEndpoint = `${backendUrl}/api/v1/integration/glpi/tickets/`

  const curlExample = useMemo(() => {
    const key = createdKey || "<prefix>.<secret>"
    const slug = companySlug || "<company_slug>"
    return [
      `curl -X POST "${glpiEndpoint}" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "X-Company-Slug: ${slug}" \\`,
      `  -H "X-API-Key: ${key}" \\`,
      `  -d '{"ticket_id":"123","title":"Chamado GLPI","description":"Teste via n8n","priority_level":4}'`,
    ].join("\n")
  }, [companySlug, createdKey, glpiEndpoint])

  const {
    data: apiKeys,
    isLoading: isLoadingKeys,
    isError: isApiKeysError,
    error: apiKeysError,
  } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await api.get("/api/api-keys/keys/")
      return res.data
    },
    retry: false,
    enabled: canManageApiKeys,
  })

  const {
    data: inboundEvents,
    isLoading: isLoadingInbound,
    isError: isInboundError,
    error: inboundError,
  } = useQuery<InboundEvent[]>({
    queryKey: ["crm-inbound-events", "glpi"],
    queryFn: async () => {
      const res = await api.get("/api/crm/integration/inbound-events/?source=glpi")
      return res.data
    },
    retry: false,
    enabled: canManageIntegrations,
  })

  const [testOpen, setTestOpen] = useState(false)
  const [testTicketId, setTestTicketId] = useState("TEST")
  const [testTitle, setTestTitle] = useState("Teste de integração (n8n/GLPI)")

  const testWebhookMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post("/api/v1/integration/glpi/tickets/", {
        ticket_id: testTicketId,
        title: testTitle,
        description: "Evento de teste disparado pelo painel de integrações.",
        priority_level: 3,
      })
      return res.data as { id: number }
    },
    onSuccess: async (data) => {
      notify.success("Teste enviado", "Card criado/atualizado no CRM.")
      await queryClient.invalidateQueries({ queryKey: ["crm-inbound-events", "glpi"] })
      const dealId = data?.id
      if (dealId && typeof window !== "undefined") {
        window.open(`/crm?dealId=${dealId}`, "_blank")
      }
    },
    onError: (err) => {
      notify.error("Falha no teste", err)
    },
  })

  const replayInboundEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await api.post(`/api/crm/integration/inbound-events/${eventId}/replay/`)
      return res.data as { id: number }
    },
    onSuccess: async (data) => {
      notify.success("Replay enviado", "Evento reprocessado.")
      await queryClient.invalidateQueries({ queryKey: ["crm-inbound-events", "glpi"] })
      const dealId = data?.id
      if (dealId && typeof window !== "undefined") {
        window.open(`/crm?dealId=${dealId}`, "_blank")
      }
    },
    onError: (err) => {
      notify.error("Falha ao reprocessar", err)
    },
  })

  const { data: tenantModulesData } = useQuery<TenantModule[] | { results?: TenantModule[] }>({
    queryKey: ["tenant-modules"],
    queryFn: async () => {
      const res = await api.get("/api/modules/my-modules/?page_size=200")
      return res.data
    },
    enabled: canManageIntegrations,
    retry: false,
  })
  const tenantModules = useMemo(() => normalizeListResponse(tenantModulesData), [tenantModulesData])
  const crmTenantModule = useMemo(
    () => tenantModules.find((m) => m.module_code === "crm") || null,
    [tenantModules]
  )

  const { data: integrationOptions, isLoading: isLoadingOptions } = useQuery<IntegrationOptions>({
    queryKey: ["crm-integration-options"],
    queryFn: async () => {
      const res = await api.get("/api/crm/integration/options/")
      return res.data
    },
    enabled: canManageIntegrations,
    retry: false,
  })

  const [glpiPipelineId, setGlpiPipelineId] = useState(GLPI_PIPELINE_DEFAULT)
  const [glpiColumnId, setGlpiColumnId] = useState(GLPI_COLUMN_DEFAULT)
  const [glpiOwnerId, setGlpiOwnerId] = useState(GLPI_OWNER_DEFAULT)
  const [glpiTecnicoId, setGlpiTecnicoId] = useState(GLPI_TECNICO_NONE)
  const [glpiContactId, setGlpiContactId] = useState(GLPI_CONTACT_AUTO)
  const [glpiSecret, setGlpiSecret] = useState("")
  const [hasGlpiSecret, setHasGlpiSecret] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    if (!crmTenantModule) return
    const glpi = getGlpiIntegrationConfig(crmTenantModule.config)
    const pipeline_id = glpi.pipeline_id
    const column_id = glpi.column_id
    const owner_id = glpi.owner_id
    const tecnico_responsavel_id = glpi.tecnico_responsavel_id
    const contact_id = glpi.contact_id
    const secret = glpi.secret
    setGlpiPipelineId(typeof pipeline_id === "number" ? String(pipeline_id) : GLPI_PIPELINE_DEFAULT)
    setGlpiColumnId(typeof column_id === "number" ? String(column_id) : GLPI_COLUMN_DEFAULT)
    setGlpiOwnerId(typeof owner_id === "number" ? String(owner_id) : GLPI_OWNER_DEFAULT)
    setGlpiTecnicoId(typeof tecnico_responsavel_id === "number" ? String(tecnico_responsavel_id) : GLPI_TECNICO_NONE)
    setGlpiContactId(typeof contact_id === "number" ? String(contact_id) : GLPI_CONTACT_AUTO)
    setHasGlpiSecret(typeof secret === "string" && secret.trim().length > 0)
    setGlpiSecret("")
    setShowSecret(false)
  }, [crmTenantModule])

  useEffect(() => {
    if (!testOpen) return
    if (testTicketId !== "TEST") return
    setTestTicketId(`TEST-${Date.now()}`)
  }, [testOpen, testTicketId])

  const availableColumns = useMemo(() => {
    const all = integrationOptions?.columns || []
    const pid = glpiPipelineId === GLPI_PIPELINE_DEFAULT ? null : parseOptionalInt(glpiPipelineId)
    if (!pid) return all
    return all.filter((c) => c.pipeline === pid)
  }, [integrationOptions?.columns, glpiPipelineId])

  useEffect(() => {
    if (glpiColumnId === GLPI_COLUMN_DEFAULT) return
    const current = parseOptionalInt(glpiColumnId)
    if (!current) return
    const stillValid = availableColumns.some((c) => c.id === current)
    if (!stillValid) setGlpiColumnId(GLPI_COLUMN_DEFAULT)
  }, [availableColumns, glpiColumnId])

  const saveGlpiConfigMutation = useMutation({
    mutationFn: async () => {
      if (!canManageIntegrations) {
        throw new Error("unauthorized")
      }
      if (!crmTenantModule) {
        throw new Error("CRM module not found")
      }

      const pipeline_id = glpiPipelineId === GLPI_PIPELINE_DEFAULT ? null : parseOptionalInt(glpiPipelineId)
      const column_id = glpiColumnId === GLPI_COLUMN_DEFAULT ? null : parseOptionalInt(glpiColumnId)
      const owner_id = glpiOwnerId === GLPI_OWNER_DEFAULT ? null : parseOptionalInt(glpiOwnerId)
      const tecnico_responsavel_id = glpiTecnicoId === GLPI_TECNICO_NONE ? null : parseOptionalInt(glpiTecnicoId)
      const contact_id = glpiContactId === GLPI_CONTACT_AUTO ? null : parseOptionalInt(glpiContactId)
      const secret = glpiSecret.trim() || null

      const currentConfig = crmTenantModule.config || {}
      const currentIntegration = isRecord(currentConfig.integration) ? currentConfig.integration : {}
      const currentGlpi = isRecord(currentIntegration.glpi) ? currentIntegration.glpi : {}

      const nextGlpi: Record<string, unknown> = {
        ...currentGlpi,
        pipeline_id,
        column_id,
        owner_id,
        tecnico_responsavel_id,
        contact_id,
      }
      if (secret) {
        nextGlpi.secret = secret
      }

      const nextConfig = {
        ...currentConfig,
        integration: {
          ...currentIntegration,
          glpi: nextGlpi,
        },
      }

      const res = await api.patch(`/api/modules/my-modules/${crmTenantModule.id}/`, { config: nextConfig })
      return res.data
    },
    onSuccess: async () => {
      notify.success("Configuração salva", "O n8n já pode usar os defaults do GLPI para criação de cards.")
      await queryClient.invalidateQueries({ queryKey: ["tenant-modules"] })
      await queryClient.invalidateQueries({ queryKey: ["crm-integration-options"] })
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "unauthorized") {
        openUnauthorized("Você não possui autorização para alterar configurações de integração.")
        return
      }
      notify.error("Falha ao salvar configuração", err)
    },
  })

  const createKeyMutation = useMutation({
    mutationFn: async () => {
      if (!canManageApiKeys) {
        throw new Error("unauthorized")
      }
      const payload = {
        name: keyName.trim() || "Integração n8n",
        scopes,
        is_active: true,
      }
      const res = await api.post("/api/api-keys/keys/", payload)
      return res.data as ApiKey
    },
    onSuccess: async (data) => {
      setCreatedKey(data.raw_key || null)
      notify.success("Chave criada", "Copie a chave agora. Ela só aparece uma vez.")
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "unauthorized") {
        openUnauthorized("Você não possui autorização para criar chaves de API.")
        return
      }
      notify.error("Falha ao criar chave", err)
    },
  })

  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null)
  const deleteKeyMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/api-keys/keys/${id}/`)
    },
    onSuccess: async () => {
      notify.success("Chave excluída", "A chave foi removida.")
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (err) => {
      notify.error("Falha ao excluir chave", err)
    },
  })

  const toggleKeyMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const res = await api.patch(`/api/api-keys/keys/${id}/`, { is_active })
      return res.data as ApiKey
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (err) => {
      notify.error("Falha ao atualizar chave", err)
    },
  })

  return (
    <div className="space-y-6">
      {canManageIntegrations ? (
        <EvolutionConfigPanel />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" aria-hidden="true" />
            Integrações (n8n / GLPI)
          </CardTitle>
          <CardDescription>
            Endpoint inbound para o n8n criar/atualizar cards no CRM com segurança (API Key + tenant + idempotência).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <div className="text-sm font-semibold">Endpoint</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={glpiEndpoint} readOnly />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  try {
                    await copyToClipboard(glpiEndpoint)
                    notify.success("Copiado", "Endpoint copiado para a área de transferência.")
                  } catch (err) {
                    notify.error("Falha ao copiar", err)
                  }
                }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Headers obrigatórios: X-Company-Slug e X-API-Key.
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-sm font-semibold">Exemplo (curl)</div>
            <div className="relative">
              <Textarea value={curlExample} readOnly className="min-h-[140px] font-mono text-xs" />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      await copyToClipboard(curlExample)
                      notify.success("Copiado", "Comando copiado para a área de transferência.")
                    } catch (err) {
                      notify.error("Falha ao copiar", err)
                    }
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copiar
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" className="gap-2" onClick={() => setTestOpen(true)}>
              <PlugZap className="h-4 w-4" aria-hidden="true" />
              Testar integração
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defaults do GLPI (CRM)</CardTitle>
          <CardDescription>
            Define pipeline/coluna e responsáveis padrão usados quando o n8n chama o endpoint de tickets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageIntegrations ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              Sem permissão para gerenciar integrações. Conceda a permissão <span className="font-mono">admin.settings_manage</span>.
            </div>
          ) : !crmTenantModule ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              Módulo CRM não encontrado para este tenant.
            </div>
          ) : isLoadingOptions ? (
            <div className="text-sm text-muted-foreground">Carregando opções...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <div className="text-sm font-semibold">Pipeline</div>
                <Select value={glpiPipelineId} onValueChange={(v) => setGlpiPipelineId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Padrão do tenant (primeiro pipeline)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLPI_PIPELINE_DEFAULT}>Padrão do tenant</SelectItem>
                    {(integrationOptions?.pipelines || []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-semibold">Coluna</div>
                <Select value={glpiColumnId} onValueChange={(v) => setGlpiColumnId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Primeira coluna do pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLPI_COLUMN_DEFAULT}>Primeira coluna</SelectItem>
                    {availableColumns.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-semibold">Responsável (owner)</div>
                <Select value={glpiOwnerId} onValueChange={(v) => setGlpiOwnerId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Primeiro usuário do tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLPI_OWNER_DEFAULT}>Padrão</SelectItem>
                    {(integrationOptions?.users || []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="text-sm font-semibold">Técnico responsável</div>
                <Select value={glpiTecnicoId} onValueChange={(v) => setGlpiTecnicoId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sem técnico padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLPI_TECNICO_NONE}>Sem técnico</SelectItem>
                    {(integrationOptions?.users || []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:col-span-2">
                <div className="text-sm font-semibold">Contato padrão</div>
                <Select value={glpiContactId} onValueChange={(v) => setGlpiContactId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Contato de integração automático" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLPI_CONTACT_AUTO}>Automático</SelectItem>
                    {(integrationOptions?.contacts || []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}{c.email ? ` (${c.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Assinatura (secret)</div>
                  {hasGlpiSecret && (
                    <Badge variant="secondary">Configurado</Badge>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type={showSecret ? "text" : "password"}
                    value={glpiSecret}
                    onChange={(e) => setGlpiSecret(e.target.value)}
                    placeholder={hasGlpiSecret ? "•••••••• (defina um novo para rotacionar)" : "Opcional (recomendado em produção)"}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const bytes = new Uint8Array(32)
                      crypto.getRandomValues(bytes)
                      const hex = Array.from(bytes)
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("")
                      setGlpiSecret(hex)
                      setShowSecret(true)
                    }}
                  >
                    Gerar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!glpiSecret.trim()}
                    onClick={async () => {
                      try {
                        await copyToClipboard(glpiSecret)
                        notify.success("Copiado", "Secret copiado para a área de transferência.")
                      } catch (err) {
                        notify.error("Falha ao copiar", err)
                      }
                    }}
                  >
                    Copiar
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowSecret((v) => !v)}>
                    {showSecret ? "Ocultar" : "Mostrar"}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Se definido, o n8n deve enviar o header <span className="font-mono">X-Integration-Signature</span> com{" "}
                  <span className="font-mono">sha256=&lt;hex&gt;</span>.
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["tenant-modules"] })}
            >
              Recarregar
            </Button>
            <Button
              type="button"
              disabled={!crmTenantModule || saveGlpiConfigMutation.isPending}
              onClick={() => {
                if (!canManageIntegrations) {
                  openUnauthorized("Você não possui autorização para alterar configurações de integração.")
                  return
                }
                saveGlpiConfigMutation.mutate()
              }}
            >
              {saveGlpiConfigMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recebidos (GLPI)</CardTitle>
          <CardDescription>
            Auditoria dos últimos eventos recebidos pelo endpoint de integração.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["crm-inbound-events", "glpi"] })}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Atualizar
            </Button>
          </div>

          {isLoadingInbound ? (
            <div className="text-sm text-muted-foreground">Carregando eventos...</div>
          ) : isInboundError ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              {inboundError instanceof AxiosError && inboundError.response?.status === 403
                ? "Sem permissão para visualizar eventos. Conceda a permissão admin.settings_manage para o seu usuário."
                : inboundError instanceof AxiosError && inboundError.response?.status === 503
                  ? "Integração indisponível no backend (migrations pendentes no CRM). Execute as migrations no servidor."
                  : "Não foi possível carregar os eventos do inbound."}
            </div>
          ) : !canManageIntegrations ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              Sem permissão para visualizar eventos. Conceda a permissão <span className="font-mono">admin.settings_manage</span>.
            </div>
          ) : !inboundEvents?.length ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              Nenhum evento recebido ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {inboundEvents.map((evt) => (
                <div key={evt.id} className="border rounded-xl p-3 flex flex-col gap-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="font-medium flex items-center gap-2">
                      <Badge
                        variant={evt.status === "processed" ? "default" : evt.status === "failed" ? "destructive" : "secondary"}
                      >
                        {evt.status}
                      </Badge>
                      <span className="font-mono text-xs">{evt.external_id}</span>
                      {evt.replayed_from_id ? (
                        <Badge variant="secondary">replay</Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatMaybeDate(evt.created_at)}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    HTTP: <span className="font-mono">{evt.response_status_code ?? "—"}</span> • Tipo:{" "}
                    <span className="font-mono">{evt.event_type}</span>
                  </div>
                  {evt.processed_deal_id ? (
                    <div className="text-xs">
                      Card:{" "}
                      <Button
                        type="button"
                        variant="link"
                        className="p-0 h-auto"
                        onClick={() => {
                          if (typeof window !== "undefined") window.open(`/crm?dealId=${evt.processed_deal_id}`, "_blank")
                        }}
                      >
                        {evt.processed_deal_title || `#${evt.processed_deal_id}`}
                      </Button>
                    </div>
                  ) : null}
                  {evt.status === "failed" && evt.error ? (
                    <div className="text-xs text-destructive bg-destructive/10 rounded-lg p-2">
                      {evt.error}
                    </div>
                  ) : null}

                  {evt.status === "failed" ? (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={replayInboundEventMutation.isPending}
                        onClick={() => {
                          if (!canManageIntegrations) {
                            openUnauthorized("Você não possui autorização para reprocessar eventos de integração.")
                            return
                          }
                          replayInboundEventMutation.mutate(evt.id)
                        }}
                      >
                        Reprocessar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
            Chaves de API (para o n8n)
          </CardTitle>
          <CardDescription>
            Gere uma chave dedicada para o fluxo GLPI → n8n → CRM. Use escopos mínimos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Escopos recomendados: <span className="font-mono">crm.glpi_ticket</span>, <span className="font-mono">crm.sync_card</span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => void queryClient.invalidateQueries({ queryKey: ["api-keys"] })}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Atualizar
              </Button>
              <Button
                type="button"
                className="gap-2"
                onClick={() => {
                  if (!canManageApiKeys) {
                    openUnauthorized("Você não possui autorização para criar chaves de API.")
                    return
                  }
                  setCreateOpen(true)
                }}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Gerar chave
              </Button>
            </div>
          </div>

          {isLoadingKeys ? (
            <div className="text-sm text-muted-foreground">Carregando chaves...</div>
          ) : isApiKeysError ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              {apiKeysError instanceof AxiosError && apiKeysError.response?.status === 403
                ? "Sem permissão para listar/criar chaves de API. Conceda a permissão settings.api_keys_manage para o seu usuário."
                : "Não foi possível carregar as chaves de API."}
            </div>
          ) : !canManageApiKeys ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              Sem permissão para gerenciar chaves de API. Conceda a permissão <span className="font-mono">settings.api_keys_manage</span>.
            </div>
          ) : !apiKeys?.length ? (
            <div className="text-sm text-muted-foreground border rounded-xl p-4">
              Nenhuma chave criada ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((k) => (
                <div key={k.id} className="border rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="font-medium flex items-center gap-2">
                      {k.name}
                      <Badge variant={k.is_active ? "default" : "secondary"}>
                        {k.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {k.prefix}...
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Criada em: {formatMaybeDate(k.created_at)} • Último uso: {formatMaybeDate(k.last_used_at)} • Expira em: {formatMaybeDate(k.expires_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Escopos: {k.scopes?.length ? k.scopes.map((s) => <span key={s} className="font-mono mr-2">{s}</span>) : "—"}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      disabled={!canManageApiKeys || toggleKeyMutation.isPending}
                      onClick={() => {
                        if (!canManageApiKeys) {
                          openUnauthorized("Você não possui autorização para gerenciar chaves de API.")
                          return
                        }
                        toggleKeyMutation.mutate({ id: k.id, is_active: !k.is_active })
                      }}
                    >
                      {k.is_active ? <ToggleRight className="h-4 w-4" aria-hidden="true" /> : <ToggleLeft className="h-4 w-4" aria-hidden="true" />}
                      {k.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="gap-2"
                      disabled={!canManageApiKeys}
                      onClick={() => setKeyToDelete(k)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => { if (!open) setKeyToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chave de API</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove a chave permanentemente. Integrações que usam esta chave vão falhar imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!keyToDelete || deleteKeyMutation.isPending}
              onClick={() => {
                if (!keyToDelete) return
                deleteKeyMutation.mutate(keyToDelete.id)
                setKeyToDelete(null)
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={testOpen}
        onOpenChange={(open) => {
          setTestOpen(open)
          if (!open) {
            setTestTicketId(`TEST-${Date.now()}`)
            setTestTitle("Teste de integração (n8n/GLPI)")
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[560px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
          <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle>Testar integração</DialogTitle>
            <DialogDescription>
              Envia um evento de teste para o endpoint de tickets (usa sua sessão atual).
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
            <div className="grid gap-2">
              <div className="text-sm font-semibold">ticket_id</div>
              <Input value={testTicketId} onChange={(e) => setTestTicketId(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <div className="text-sm font-semibold">Título</div>
              <Input value={testTitle} onChange={(e) => setTestTitle(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTestOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={testWebhookMutation.isPending || !testTicketId.trim() || !testTitle.trim()}
              onClick={() => testWebhookMutation.mutate()}
            >
              <PlugZap className="h-4 w-4" aria-hidden="true" />
              {testWebhookMutation.isPending ? "Enviando..." : "Enviar teste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreatedKey(null)
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[620px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
          <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle>Gerar chave para n8n</DialogTitle>
            <DialogDescription>
              A chave completa só aparece uma vez. Copie e guarde no n8n.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 space-y-4">
            <div className="grid gap-2">
              <div className="text-sm font-semibold">Nome</div>
              <Input value={keyName} onChange={(e) => setKeyName(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-semibold">Escopos</div>
              <div className="flex flex-wrap gap-2">
                {RECOMMENDED_SCOPES.map((s) => {
                  const checked = scopes.includes(s)
                  return (
                    <Button
                      key={s}
                      type="button"
                      variant={checked ? "default" : "outline"}
                      className="gap-2"
                      onClick={() => {
                        setScopes((prev) => {
                          if (prev.includes(s)) return prev.filter((x) => x !== s)
                          return [...prev, s]
                        })
                      }}
                    >
                      {checked ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                      <span className="font-mono text-xs">{s}</span>
                    </Button>
                  )
                })}
              </div>
            </div>

            {createdKey ? (
              <div className="grid gap-2">
                <div className="text-sm font-semibold">Sua chave</div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input value={createdKey} readOnly className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={async () => {
                      try {
                        await copyToClipboard(createdKey)
                        notify.success("Copiado", "Chave copiada para a área de transferência.")
                      } catch (err) {
                        notify.error("Falha ao copiar", err)
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copiar
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Cole a chave no n8n como header <span className="font-mono">X-API-Key</span>.
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Fechar
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={createKeyMutation.isPending || scopes.length === 0}
              onClick={() => {
                if (!canManageApiKeys) {
                  openUnauthorized("Você não possui autorização para criar chaves de API.")
                  return
                }
                createKeyMutation.mutate()
              }}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {createKeyMutation.isPending ? "Gerando..." : "Gerar chave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
