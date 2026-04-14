import { api } from "@/lib/axios"
import { AxiosError } from "axios"

export type OfflineAttachmentPhase = "before" | "during" | "after"
export type OfflineAttachmentKind = "photo" | "file"

export interface OfflineDealAttachmentUploadBase {
  id: string
  dealId: number
  kind: OfflineAttachmentKind
  phase: OfflineAttachmentPhase
  caption: string
  createdAt: string
  attempts: number
  nextAttemptAt: string
}

export interface OfflineDealAttachmentUploadFile extends OfflineDealAttachmentUploadBase {
  source: "file"
  fileName: string
  fileType: string
  fileSize: number
  blob: Blob
}

export interface OfflineDealAttachmentUploadMedia extends OfflineDealAttachmentUploadBase {
  source: "media"
  mediaId: string
  previewUrl: string
  title: string
  fileType: string
}

export type OfflineDealAttachmentUpload = OfflineDealAttachmentUploadFile | OfflineDealAttachmentUploadMedia

export type OfflineDealAttachmentUploadEnqueueInput =
  | Omit<OfflineDealAttachmentUploadFile, "id" | "createdAt" | "attempts" | "nextAttemptAt">
  | Omit<OfflineDealAttachmentUploadMedia, "id" | "createdAt" | "attempts" | "nextAttemptAt">

const DB_NAME = "atlas"
const DB_VERSION = 1
const STORE_NAME = "crm_deal_attachment_uploads"
const CHANGE_EVENT = "crm-offline-attachments-changed"

function notifyChanged() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined"
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      reject(new Error("IndexedDB não disponível."))
      return
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("dealId", "dealId", { unique: false })
        store.createIndex("createdAt", "createdAt", { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error("Falha ao abrir IndexedDB."))
  })
}

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `tmp-${Date.now()}-${Math.random()}`
}

export async function enqueueOfflineDealAttachmentUpload(
  input: OfflineDealAttachmentUploadEnqueueInput
) {
  const db = await openDb()
  const base = {
    id: randomId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: new Date().toISOString(),
  }
  const record: OfflineDealAttachmentUpload =
    input.source === "media"
      ? ({
          ...base,
          ...input,
        } satisfies OfflineDealAttachmentUploadMedia)
      : ({
          ...base,
          ...input,
        } satisfies OfflineDealAttachmentUploadFile)

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Falha ao gravar no IndexedDB."))
    tx.objectStore(STORE_NAME).put(record)
  })

  db.close()
  notifyChanged()
  return record
}

function normalizeRecord(record: unknown): OfflineDealAttachmentUpload | null {
  if (!record || typeof record !== "object") return null
  const r = record as Partial<OfflineDealAttachmentUpload> & Record<string, unknown>
  const createdAt = typeof r.createdAt === "string" ? r.createdAt : new Date().toISOString()
  const attempts = typeof r.attempts === "number" && Number.isFinite(r.attempts) ? r.attempts : 0
  const nextAttemptAt = typeof r.nextAttemptAt === "string" ? r.nextAttemptAt : createdAt

  const base = {
    id: String(r.id || ""),
    dealId: Number(r.dealId || 0),
    kind: (r.kind === "file" ? "file" : "photo") as OfflineAttachmentKind,
    phase: (r.phase === "before" || r.phase === "after" ? r.phase : "during") as OfflineAttachmentPhase,
    caption: typeof r.caption === "string" ? r.caption : "",
    createdAt,
    attempts,
    nextAttemptAt,
  }

  if (!base.id || !Number.isFinite(base.dealId) || base.dealId <= 0) return null

  const mediaIdValue = r["mediaId"]
  const previewUrlValue = r["previewUrl"]
  const titleValue = r["title"]
  const fileTypeValue = r["fileType"]

  if (r.source === "media" || typeof mediaIdValue === "string") {
    const mediaId = typeof mediaIdValue === "string" ? mediaIdValue : ""
    const previewUrl = typeof previewUrlValue === "string" ? previewUrlValue : ""
    const title = typeof titleValue === "string" ? titleValue : ""
    const fileType = typeof fileTypeValue === "string" ? fileTypeValue : ""
    if (!mediaId) return null
    return {
      ...base,
      source: "media",
      mediaId,
      previewUrl,
      title,
      fileType,
    }
  }

  const blobValue = r["blob"]
  const fileNameValue = r["fileName"]
  const fileSizeValue = r["fileSize"]

  const blob = blobValue instanceof Blob ? blobValue : null
  const fileName = typeof fileNameValue === "string" ? fileNameValue : "upload"
  const fileType = typeof fileTypeValue === "string" ? fileTypeValue : ""
  const fileSize = typeof fileSizeValue === "number" && Number.isFinite(fileSizeValue) ? fileSizeValue : 0
  if (!blob) return null
  return {
    ...base,
    source: "file",
    fileName,
    fileType,
    fileSize,
    blob,
  }
}

export async function listOfflineDealAttachmentUploads(dealId?: number) {
  if (!hasIndexedDb()) return []
  const db = await openDb()

  const records = await new Promise<unknown[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = dealId ? store.index("dealId").getAll(dealId) : store.getAll()
    request.onsuccess = () => resolve((request.result as unknown[]) || [])
    request.onerror = () => reject(request.error || new Error("Falha ao listar filas offline."))
  })

  db.close()
  const normalized = records
    .map((item) => normalizeRecord(item))
    .filter((item): item is OfflineDealAttachmentUpload => Boolean(item))
  return normalized.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function removeOfflineDealAttachmentUpload(id: string) {
  if (!hasIndexedDb()) return
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Falha ao remover da fila offline."))
    tx.objectStore(STORE_NAME).delete(id)
  })
  db.close()
  notifyChanged()
}

async function updateOfflineDealAttachmentUpload(record: OfflineDealAttachmentUpload) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Falha ao atualizar fila offline."))
    tx.objectStore(STORE_NAME).put(record)
  })
  db.close()
  notifyChanged()
}

function computeNextAttempt(attempts: number) {
  const baseMs = 30_000
  const maxMs = 30 * 60_000
  const ms = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempts)))
  return new Date(Date.now() + ms).toISOString()
}

function isNetworkError(err: unknown) {
  return err instanceof AxiosError && !err.response
}

export async function flushOfflineDealAttachmentUploads(options?: { dealId?: number; signal?: AbortSignal }) {
  if (!hasIndexedDb()) return { processed: 0, uploaded: 0, dropped: 0 }
  const items = await listOfflineDealAttachmentUploads(options?.dealId)
  let processed = 0
  let uploaded = 0
  let dropped = 0
  const now = new Date()

  for (const item of items) {
    if (options?.signal?.aborted) break
    if (typeof navigator !== "undefined" && navigator.onLine === false) break
    if (new Date(item.nextAttemptAt) > now) continue
    processed += 1

    const formData = new FormData()
    formData.append("kind", item.kind)
    formData.append("phase", item.phase)
    if (item.caption) formData.append("caption", item.caption)
    if (item.source === "media") {
      formData.append("media_id", item.mediaId)
    } else {
      formData.append("file", new File([item.blob], item.fileName, { type: item.fileType }))
    }

    try {
      await api.post(`/api/crm/deals/${item.dealId}/attachments/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: options?.signal,
      })
      await removeOfflineDealAttachmentUpload(item.id)
      uploaded += 1
    } catch (err) {
      if (isNetworkError(err)) {
        const next: OfflineDealAttachmentUpload = {
          ...item,
          attempts: item.attempts + 1,
          nextAttemptAt: computeNextAttempt(item.attempts + 1),
        }
        await updateOfflineDealAttachmentUpload(next)
        break
      }

      if (err instanceof AxiosError && err.response) {
        const status = err.response.status
        if (status === 400 || status === 404) {
          await removeOfflineDealAttachmentUpload(item.id)
          dropped += 1
          continue
        }
        if (status === 401 || status === 403) {
          const next: OfflineDealAttachmentUpload = {
            ...item,
            attempts: item.attempts + 1,
            nextAttemptAt: computeNextAttempt(item.attempts + 1),
          }
          await updateOfflineDealAttachmentUpload(next)
          break
        }
      }

      const next: OfflineDealAttachmentUpload = {
        ...item,
        attempts: item.attempts + 1,
        nextAttemptAt: computeNextAttempt(item.attempts + 1),
      }
      await updateOfflineDealAttachmentUpload(next)
      break
    }
  }

  return { processed, uploaded, dropped }
}
