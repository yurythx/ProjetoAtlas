"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { UploadCloud, Trash2, RefreshCw, Image as ImageIcon, File as FileIcon, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

import { flushOfflineDealAttachmentUploads, listOfflineDealAttachmentUploads, removeOfflineDealAttachmentUpload } from "./offline-attachments"

type QueueItem = Awaited<ReturnType<typeof listOfflineDealAttachmentUploads>>[number]

function formatPhase(phase: QueueItem["phase"]) {
  if (phase === "before") return "Antes"
  if (phase === "after") return "Depois"
  return "Durante"
}

export function CRMOfflineAttachmentsIndicator() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<QueueItem[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const count = items.length

  const dealTitleById = useMemo(() => {
    const cached = queryClient.getQueryData(["crm-deals"]) as unknown
    if (!Array.isArray(cached)) return new Map<number, string>()
    const map = new Map<number, string>()
    cached.forEach((item) => {
      if (!item || typeof item !== "object") return
      const rawId = (item as Record<string, unknown>)["id"]
      const rawTitle = (item as Record<string, unknown>)["title"]
      if (typeof rawId === "number" && typeof rawTitle === "string") {
        map.set(rawId, rawTitle)
      }
    })
    return map
  }, [queryClient])

  const refresh = useCallback(async () => {
    const next = await listOfflineDealAttachmentUploads()
    setItems(next)
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => void refresh(), 15_000)
    const handler = () => void refresh()
    window.addEventListener("crm-offline-attachments-changed", handler)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("crm-offline-attachments-changed", handler)
    }
  }, [refresh])

  const grouped = useMemo(() => {
    const map = new Map<number, QueueItem[]>()
    items.forEach((item) => {
      const key = item.dealId
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    })
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [items])

  const handleRemove = async (id: string) => {
    await removeOfflineDealAttachmentUpload(id)
    toast.success("Pendente removido.")
    await refresh()
  }

  const handleSync = async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      toast.error("Você está offline.")
      return
    }
    setIsRefreshing(true)
    try {
      const result = await flushOfflineDealAttachmentUploads()
      if (result.uploaded > 0 || result.dropped > 0) {
        queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      }
      if (result.uploaded > 0) {
        toast.success(`Sincronizado: ${result.uploaded} anexo(s) enviado(s).`)
      } else {
        toast.success("Fila verificada.")
      }
      await refresh()
    } finally {
      setIsRefreshing(false)
    }
  }

  if (count === 0) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl bg-primary/5 hover:bg-primary/10 border-primary/20 transition-all gap-2 h-10 px-4"
          aria-label={`Pendências de upload: ${count}`}
        >
          <UploadCloud className="h-4 w-4 text-primary" aria-hidden="true" />
          Pendentes
          <Badge variant="secondary" className="ml-1">
            {count}
          </Badge>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[90vw] sm:w-[520px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_auto_1fr]">
        <SheetHeader className="border-b bg-muted/30 px-4 py-4 text-left">
          <SheetTitle>Pendências de upload</SheetTitle>
          <SheetDescription>Anexos salvos localmente aguardando sincronização.</SheetDescription>
        </SheetHeader>

        <div className="px-4 py-4 flex items-center gap-2">
          <Button type="button" onClick={() => void handleSync()} disabled={isRefreshing} className="gap-2">
            <RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            Sincronizar
          </Button>
          <div className="text-xs text-muted-foreground">
            {typeof navigator !== "undefined" && navigator.onLine === false ? "Offline" : "Online"}
          </div>
        </div>

        <ScrollArea className="h-full px-4 pb-6">
          <div className="space-y-4">
            {grouped.map(([dealId, group]) => (
              <div key={dealId} className="rounded-2xl border bg-card">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{dealTitleById.get(dealId) || `Card #${dealId}`}</div>
                    <div className="text-xs text-muted-foreground">#{dealId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{group.length}</Badge>
                    <Button
                      asChild
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      onClick={() => setOpen(false)}
                    >
                      <Link href={`/crm?dealId=${dealId}`} aria-label={`Abrir card ${dealId}`}>
                        Abrir
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {group.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {item.kind === "photo" ? (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          ) : (
                            <FileIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          )}
                          <div className="text-sm font-medium truncate">
                            {item.source === "media" ? item.title || "Mídia" : item.fileName}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatPhase(item.phase)}</span>
                          <span>•</span>
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                          <span>•</span>
                          <span>Tentativas: {item.attempts}</span>
                        </div>
                        {item.caption ? <div className="mt-2 text-sm text-foreground">{item.caption}</div> : null}
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        onClick={() => void handleRemove(item.id)}
                        aria-label="Remover pendência"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
