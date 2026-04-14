"use client"

import { useCallback, useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { flushOfflineDealAttachmentUploads, listOfflineDealAttachmentUploads } from "./offline-attachments"

export function CRMAttachmentOfflineSync() {
  const queryClient = useQueryClient()
  const isSyncingRef = useRef(false)

  const syncOnce = useCallback(async () => {
    if (isSyncingRef.current) return
    if (typeof navigator !== "undefined" && navigator.onLine === false) return

    isSyncingRef.current = true
    try {
      const queued = await listOfflineDealAttachmentUploads()
      if (queued.length === 0) return

      const result = await flushOfflineDealAttachmentUploads()
      if (result.uploaded > 0 || result.dropped > 0) {
        queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      }
      if (result.uploaded > 0) {
        toast.success(`Sincronizado: ${result.uploaded} anexo(s) enviado(s).`)
      }
    } finally {
      isSyncingRef.current = false
    }
  }, [queryClient])

  useEffect(() => {
    void syncOnce()
    const interval = window.setInterval(() => {
      void syncOnce()
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [syncOnce])

  useEffect(() => {
    const handleOnline = () => {
      void syncOnce()
    }
    window.addEventListener("online", handleOnline)
    return () => window.removeEventListener("online", handleOnline)
  }, [syncOnce])

  return null
}

