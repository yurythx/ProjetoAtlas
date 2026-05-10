"use client"

import { useState } from "react"
import { Download, FileText, Table2, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { api } from "@/lib/axios"
import { toast } from "sonner"

type ReportType = "crm" | "finance" | "articles" | "payroll"
type ExportFormat = "csv" | "pdf"

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportType: ReportType
  filters?: Record<string, unknown>
}

type TaskStatus = "idle" | "pending" | "processing" | "done" | "error"

const ENDPOINT: Record<ReportType, string> = {
  crm: "/api/reports/crm/deals/export/",
  finance: "/api/reports/finance/export/",
  articles: "/api/reports/articles/export/",
  payroll: "/api/reports/payroll/export/",
}

const LABEL: Record<ReportType, string> = {
  crm: "Relatório de Deals — CRM",
  finance: "Relatório Financeiro",
  articles: "Base de Conhecimento — Artigos",
  payroll: "Folha de Pagamento",
}

export function ExportModal({ open, onOpenChange, reportType, filters = {} }: ExportModalProps) {
  const [fmt, setFmt] = useState<ExportFormat>("csv")
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("idle")
  const [taskId, setTaskId] = useState<string | null>(null)
  const [pollRef, setPollRef] = useState<ReturnType<typeof setInterval> | null>(null)

  function resetState() {
    setTaskStatus("idle")
    setTaskId(null)
    if (pollRef) clearInterval(pollRef)
    setPollRef(null)
  }

  function handleClose(v: boolean) {
    if (!v) resetState()
    onOpenChange(v)
  }

  async function startExport() {
    setTaskStatus("pending")
    try {
      const res = await api.post(ENDPOINT[reportType], { format: fmt, ...filters })
      const id: string = res.data.task_id
      setTaskId(id)
      setTaskStatus("processing")

      const interval = setInterval(async () => {
        try {
          const poll = await api.get(`/api/reports/tasks/${id}/`)
          const s: string = poll.data.status
          if (s === "done") {
            clearInterval(interval)
            setPollRef(null)
            setTaskStatus("done")
          } else if (s === "error") {
            clearInterval(interval)
            setPollRef(null)
            setTaskStatus("error")
            toast.error(`Erro ao gerar relatório: ${poll.data.detail ?? "tente novamente"}`)
          }
        } catch {
          clearInterval(interval)
          setPollRef(null)
          setTaskStatus("error")
        }
      }, 2000)
      setPollRef(interval)
    } catch {
      setTaskStatus("error")
      toast.error("Não foi possível iniciar a exportação.")
    }
  }

  async function downloadFile() {
    if (!taskId) return
    const url = `/api/reports/tasks/${taskId}/file/`
    const res = await api.get(url, { responseType: "blob" })
    const disposition: string = res.headers["content-disposition"] ?? ""
    const match = /filename="?([^";\n]+)"?/.exec(disposition)
    const filename = match?.[1] ?? `relatorio.${fmt}`
    const blob = new Blob([res.data], { type: res.headers["content-type"] })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    URL.revokeObjectURL(a.href)
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Exportar {LABEL[reportType]}
          </DialogTitle>
          <DialogDescription>
            Escolha o formato e clique em Gerar para iniciar a exportação em segundo plano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <Label>Formato do arquivo</Label>
            <RadioGroup value={fmt} onValueChange={(v: string) => setFmt(v as ExportFormat)} className="flex gap-4">
              <div className="flex items-center gap-2 p-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors has-[input:checked]:border-primary has-[input:checked]:bg-primary/5 flex-1">
                <RadioGroupItem value="csv" id="fmt-csv" />
                <Label htmlFor="fmt-csv" className="flex items-center gap-2 cursor-pointer font-normal">
                  <Table2 className="h-4 w-4 text-emerald-600" />
                  CSV
                </Label>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-xl border cursor-pointer hover:bg-muted/50 transition-colors has-[input:checked]:border-primary has-[input:checked]:bg-primary/5 flex-1">
                <RadioGroupItem value="pdf" id="fmt-pdf" />
                <Label htmlFor="fmt-pdf" className="flex items-center gap-2 cursor-pointer font-normal">
                  <FileText className="h-4 w-4 text-red-500" />
                  PDF
                </Label>
              </div>
            </RadioGroup>
          </div>

          {taskStatus === "idle" && (
            <Button className="w-full" onClick={startExport}>
              <Download className="h-4 w-4 mr-2" />
              Gerar relatório
            </Button>
          )}

          {taskStatus === "pending" && (
            <div className="flex items-center justify-center gap-2 py-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Iniciando exportação…</span>
            </div>
          )}

          {taskStatus === "processing" && (
            <div className="flex items-center justify-center gap-2 py-2 text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Gerando arquivo, aguarde…</span>
            </div>
          )}

          {taskStatus === "done" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Relatório pronto!</span>
              </div>
              <Button className="w-full" onClick={downloadFile}>
                <Download className="h-4 w-4 mr-2" />
                Baixar {fmt.toUpperCase()}
              </Button>
            </div>
          )}

          {taskStatus === "error" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">Falha na geração. Tente novamente.</span>
              </div>
              <Button variant="outline" className="w-full" onClick={resetState}>
                Tentar novamente
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
