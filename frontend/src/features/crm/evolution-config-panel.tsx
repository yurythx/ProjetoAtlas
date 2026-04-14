"use client"

import { useState } from "react"
import {
  MessageCircle,
  Plus,
  Trash2,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  Pencil,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { useEvolutionConfig, type EvolutionConfig, useCRM } from "./use-crm"

// ─── Sub: Config Card ─────────────────────────────────────────────────────────

function ConfigCard({
  config,
  onEdit,
  onDelete,
}: {
  config: EvolutionConfig
  onEdit: (c: EvolutionConfig) => void
  onDelete: (id: number) => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(config.webhook_url)
    setCopied(true)
    toast.success("URL do webhook copiada!")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/5 p-5 transition-all hover:border-emerald-500/30 hover:bg-white/8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{config.instance_name}</p>
            <p className="text-xs text-white/50 truncate max-w-[200px]">{config.api_url}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {config.is_active ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
              <CheckCircle className="h-3 w-3" /> Ativo
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
              <XCircle className="h-3 w-3" /> Inativo
            </span>
          )}
          <button
            onClick={() => onEdit(config)}
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(config.id)}
            className="rounded-lg p-1.5 text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="mt-4 rounded-xl bg-black/30 p-3">
        <p className="mb-1 text-xs font-medium text-white/40">URL do Webhook (Evolution API)</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate text-xs text-emerald-300">{config.webhook_url}</code>
          <button
            onClick={handleCopy}
            className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
          <a
            href={config.api_url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Commands hint */}
      <div className="mt-3 flex gap-2 flex-wrap">
        <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/40">
          💬 Qualquer mensagem → Cria deal
        </span>
        <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/40">
          🔍 #status → Consulta chamados
        </span>
        <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-white/40">
          ⭐ XLA automático ao fechar
        </span>
      </div>
    </div>
  )
}

// ─── Sub: Form Modal ──────────────────────────────────────────────────────────

function ConfigFormModal({
  initial,
  onClose,
  onSave,
  isLoading,
  pipelines,
}: {
  initial?: EvolutionConfig | null
  onClose: () => void
  onSave: (data: Partial<EvolutionConfig>) => void
  isLoading: boolean
  pipelines: { id: number; name: string; columns?: { id: number; title: string }[] }[]
}) {
  const [form, setForm] = useState<Partial<EvolutionConfig>>({
    instance_name: initial?.instance_name ?? "",
    api_url: initial?.api_url ?? "",
    api_token: "",
    is_active: initial?.is_active ?? true,
    default_pipeline: initial?.default_pipeline ?? null,
    default_column: initial?.default_column ?? null,
  })

  const field = (k: keyof typeof form, v: string | boolean | number | null) =>
    setForm((f) => ({ ...f, [k]: v }))

  const selectedPipeline = pipelines.find((p) => p.id === form.default_pipeline)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0f1117] p-6 shadow-2xl">
        <h2 className="mb-5 text-lg font-semibold text-white">
          {initial ? "Editar Integração WhatsApp" : "Nova Integração WhatsApp"}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Nome da Instância</label>
            <input
              id="evo-instance-name"
              value={form.instance_name as string}
              onChange={(e) => field("instance_name", e.target.value)}
              placeholder="ex: atlas-prod"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">URL da Evolution API</label>
            <input
              id="evo-api-url"
              value={form.api_url as string}
              onChange={(e) => field("api_url", e.target.value)}
              placeholder="https://evo.meudominio.com"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">
              API Token {initial && <span className="text-white/30">(deixe vazio para manter o atual)</span>}
            </label>
            <input
              id="evo-api-token"
              type="password"
              value={form.api_token as string}
              onChange={(e) => field("api_token", e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-emerald-500/50"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-white/60">Pipeline Padrão (para novos deals)</label>
            <select
              id="evo-default-pipeline"
              value={form.default_pipeline ?? ""}
              onChange={(e) => {
                field("default_pipeline", e.target.value ? Number(e.target.value) : null)
                field("default_column", null)
              }}
              className="w-full rounded-lg border border-white/10 bg-[#0f1117] px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
            >
              <option value="">— Nenhum —</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {selectedPipeline?.columns && selectedPipeline.columns.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-white/60">Coluna de Entrada Padrão</label>
              <select
                id="evo-default-column"
                value={form.default_column ?? ""}
                onChange={(e) => field("default_column", e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-lg border border-white/10 bg-[#0f1117] px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
              >
                <option value="">— Nenhuma —</option>
                {selectedPipeline.columns.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active as boolean}
              onChange={(e) => field("is_active", e.target.checked)}
              className="rounded border-white/20 bg-white/5 accent-emerald-500"
            />
            <span className="text-sm text-white/70">Integração ativa</span>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            id="evo-save-btn"
            onClick={() => onSave(form)}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "Salvar alterações" : "Criar integração"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function EvolutionConfigPanel() {
  const { configs, isLoading, createConfig, updateConfig, deleteConfig } = useEvolutionConfig()
  const { pipelines } = useCRM()
  const [modal, setModal] = useState<{ open: boolean; editing: EvolutionConfig | null }>({
    open: false,
    editing: null,
  })

  const handleSave = (data: Partial<EvolutionConfig>) => {
    if (modal.editing) {
      updateConfig.mutate(
        { id: modal.editing.id, ...data },
        { onSuccess: () => setModal({ open: false, editing: null }) }
      )
    } else {
      createConfig.mutate(data, {
        onSuccess: () => setModal({ open: false, editing: null }),
      })
    }
  }

  const isSaving = createConfig.isPending || updateConfig.isPending

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <MessageCircle className="h-5 w-5 text-emerald-400" />
            WhatsApp — Evolution API
          </h3>
          <p className="mt-1 text-xs text-white/50">
            Configure instâncias do WhatsApp para criar deals automaticamente e coletar XLA via chat.
          </p>
        </div>
        <button
          id="new-evolution-config-btn"
          onClick={() => setModal({ open: true, editing: null })}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          Nova instância
        </button>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-white/30">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-12 text-center">
          <MessageCircle className="mb-3 h-10 w-10 text-white/20" />
          <p className="text-sm font-medium text-white/40">Nenhuma integração configurada</p>
          <p className="mt-1 text-xs text-white/25">
            Adicione uma instância da Evolution API para habilitar o atendimento via WhatsApp.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {configs.map((config) => (
            <ConfigCard
              key={config.id}
              config={config}
              onEdit={(c) => setModal({ open: true, editing: c })}
              onDelete={(id) => {
                if (confirm("Remover esta integração?")) deleteConfig.mutate(id)
              }}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <ConfigFormModal
          initial={modal.editing}
          onClose={() => setModal({ open: false, editing: null })}
          onSave={handleSave}
          isLoading={isSaving}
          pipelines={pipelines ?? []}
        />
      )}
    </div>
  )
}
