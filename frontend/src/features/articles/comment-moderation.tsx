"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { toast } from "sonner"
import { Check, Link2, Loader2, Search, Trash2, X } from "lucide-react"

type ModerationItem = {
  id: number
  content: string
  created_at: string
  parent?: number | null
  is_public?: boolean
  is_approved: boolean
  author_name?: string | null
  name?: string | null
  email?: string | null
}

type Comment = ModerationItem & {
  article: number
  article_title?: string | null
  article_slug?: string | null
  replies?: ModerationItem[]
  reply_count?: number
}

type SampleItem = ModerationItem & {
  article?: number
  article_title?: string | null
  article_slug?: string | null
}

type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

type ArticleLite = { id: number; title: string; slug: string }

const parsePageParam = (nextUrl: string | null) => {
  if (!nextUrl) return undefined
  try {
    const url = new URL(nextUrl, "http://localhost")
    const p = url.searchParams.get("page")
    const n = p ? Number(p) : NaN
    return Number.isFinite(n) && n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

export function CommentModeration() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<"pending" | "approved" | "all">("pending")
  const [commentToDelete, setCommentToDelete] = React.useState<ModerationItem | null>(null)
  const [threadToDelete, setThreadToDelete] = React.useState<Comment | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [bulkFilterConfirmOpen, setBulkFilterConfirmOpen] = React.useState(false)
  const [bulkFilterAction, setBulkFilterAction] = React.useState<"approve" | "disapprove" | "delete" | null>(null)
  const [bulkFilterCount, setBulkFilterCount] = React.useState<number | null>(null)
  const [bulkFilterSample, setBulkFilterSample] = React.useState<SampleItem[] | null>(null)
  const [bulkIncludeReplies, setBulkIncludeReplies] = React.useState(true)
  const [focusCommentId, setFocusCommentId] = React.useState<number | null>(null)
  const [highlightCommentId, setHighlightCommentId] = React.useState<number | null>(null)
  const highlightTimeoutRef = React.useRef<number | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const [articleId, setArticleId] = React.useState<string>("")
  const [fromDate, setFromDate] = React.useState<string>("")
  const [toDate, setToDate] = React.useState<string>("")
  const initializedRef = React.useRef(false)
  const [repliesByParent, setRepliesByParent] = React.useState<Record<number, { items: ModerationItem[]; next: string | null; isLoading: boolean }>>({})

  const debounced = React.useMemo(() => query.trim(), [query])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Link copiado")
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  const makePublicUrl = (articleSlug: string | null | undefined, hash: string) => {
    if (!articleSlug) return null
    try {
      const base = new URL(`/p/artigos/${encodeURIComponent(articleSlug)}`, window.location.origin)
      base.hash = hash
      return base.toString()
    } catch {
      return null
    }
  }

  React.useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const s = (searchParams.get("status") || "").toLowerCase()
    if (s === "pending") setStatus("pending")
    else if (s === "approved") setStatus("approved")
    else if (s === "all") setStatus("all")

    const a = searchParams.get("article")
    if (a && /^[0-9]+$/.test(a)) setArticleId(a)

    const q = searchParams.get("q")
    if (q) setQuery(q)

    const from = searchParams.get("from")
    if (from) setFromDate(from)

    const to = searchParams.get("to")
    if (to) setToDate(to)

    const commentIdParam = searchParams.get("comment")
    if (commentIdParam && /^[0-9]+$/.test(commentIdParam)) setFocusCommentId(Number(commentIdParam))
  }, [searchParams])

  const articlesQuery = useQuery({
    queryKey: ["articles-lite"],
    queryFn: async ({ signal }) => {
      const res = await api.get<Paginated<ArticleLite>>("/api/articles/articles/", {
        params: { ordering: "title", page_size: 200 },
        signal,
      })
      return res.data.results
    },
  })

  const createdAtGte = React.useMemo(() => {
    if (!fromDate) return null
    const d = new Date(`${fromDate}T00:00:00.000Z`)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }, [fromDate])

  const createdAtLte = React.useMemo(() => {
    if (!toDate) return null
    const d = new Date(`${toDate}T23:59:59.999Z`)
    return Number.isFinite(d.getTime()) ? d.toISOString() : null
  }, [toDate])

  const filterPayload = React.useMemo(() => {
    const payload: Record<string, string | number | boolean> = { is_public: true, parent__isnull: true }
    if (status === "pending") payload.is_approved = false
    if (status === "approved") payload.is_approved = true
    if (debounced) payload.search = debounced
    if (articleId) payload.article = Number(articleId)
    if (createdAtGte) payload.created_at__gte = createdAtGte
    if (createdAtLte) payload.created_at__lte = createdAtLte
    payload.include_replies = bulkIncludeReplies
    return payload
  }, [articleId, bulkIncludeReplies, createdAtGte, createdAtLte, debounced, status])

  const commentsQuery = useInfiniteQuery<Paginated<Comment>>({
    queryKey: ["articles-comments-moderation", status, debounced, articleId, createdAtGte, createdAtLte],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const safePage = typeof pageParam === "number" ? pageParam : Number(pageParam)
      const params: Record<string, string | number | boolean> = {
        ordering: "-created_at",
        page: Number.isFinite(safePage) && safePage > 0 ? safePage : 1,
        page_size: 20,
        is_public: true,
      }
      if (status === "pending") params.is_approved = false
      if (status === "approved") params.is_approved = true
      if (debounced) params.search = debounced
      if (articleId) params.article = Number(articleId)
      params.parent__isnull = true
      if (createdAtGte) params.created_at__gte = createdAtGte
      if (createdAtLte) params.created_at__lte = createdAtLte
      const res = await api.get<Paginated<Comment>>("/api/articles/comments/", { params, signal })
      return res.data
    },
    getNextPageParam: (lastPage) => parsePageParam(lastPage.next),
  })

  const comments = React.useMemo(() => {
    const pages = commentsQuery.data?.pages ?? []
    return pages.flatMap((p) => p.results)
  }, [commentsQuery.data])

  React.useEffect(() => {
    if (!focusCommentId) return
    const el = document.getElementById(`comentario-${focusCommentId}`)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    setHighlightCommentId(focusCommentId)
    if (highlightTimeoutRef.current) window.clearTimeout(highlightTimeoutRef.current)
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightCommentId(null)
    }, 2500)
  }, [comments.length, focusCommentId])

  const loadMoreReplies = async (parentId: number) => {
    const cur = repliesByParent[parentId]
    const pageParam = parsePageParam(cur?.next ?? null) ?? 1
    setRepliesByParent((prev) => {
      const existing = prev[parentId]
      return { ...prev, [parentId]: { items: existing?.items ?? [], next: existing?.next ?? null, isLoading: true } }
    })
    try {
      const res = await api.get<Paginated<ModerationItem>>(`/api/articles/comments/${parentId}/replies/`, {
        params: { page: pageParam, page_size: 20 },
      })
      setRepliesByParent((prev) => {
        const existing = prev[parentId]?.items ?? []
        const seen = new Set(existing.map((x) => x.id))
        const merged = [...existing, ...res.data.results.filter((x) => !seen.has(x.id))]
        return { ...prev, [parentId]: { items: merged, next: res.data.next, isLoading: false } }
      })
    } catch {
      setRepliesByParent((prev) => {
        const existing = prev[parentId]
        return { ...prev, [parentId]: { items: existing?.items ?? [], next: existing?.next ?? null, isLoading: false } }
      })
    }
  }

  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [status, debounced, articleId, createdAtGte, createdAtLte])

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllLoaded = () => {
    setSelectedIds(new Set(comments.map((c) => c.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const approveMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await api.post(`/api/articles/comments/${commentId}/approve/`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success("Comentário aprovado")
    },
    onError: () => {
      toast.error("Erro ao aprovar comentário")
    },
  })

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await api.post<{ updated: number }>("/api/articles/comments/bulk_approve/", { ids })
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Aprovados: ${data.updated}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao aprovar em massa")
    },
  })

  const bulkDisapproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await api.post<{ updated: number }>("/api/articles/comments/bulk_disapprove/", { ids })
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Reprovados: ${data.updated}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao reprovar em massa")
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await api.post<{ deleted: number }>("/api/articles/comments/bulk_delete/", { ids })
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Removidos: ${data.deleted}`)
      clearSelection()
      setBulkDeleteOpen(false)
    },
    onError: () => {
      toast.error("Erro ao remover em massa")
    },
  })

  const bulkApproveFilteredMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ updated: number }>("/api/articles/comments/bulk_approve_filtered/", filterPayload)
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Aprovados: ${data.updated}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao aprovar pelo filtro")
    },
  })

  const bulkDisapproveFilteredMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ updated: number }>("/api/articles/comments/bulk_disapprove_filtered/", filterPayload)
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Reprovados: ${data.updated}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao reprovar pelo filtro")
    },
  })

  const bulkDeleteFilteredMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ deleted: number }>("/api/articles/comments/bulk_delete_filtered/", filterPayload)
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Removidos: ${data.deleted}`)
      clearSelection()
      setBulkFilterConfirmOpen(false)
    },
    onError: () => {
      toast.error("Erro ao remover pelo filtro")
    },
  })

  const bulkFilteredCountMutation = useMutation({
    mutationFn: async (payload: Record<string, string | number | boolean>) => {
      const res = await api.post<{ count: number; sample_items?: SampleItem[] }>("/api/articles/comments/bulk_filtered_count/", payload)
      return res.data
    },
    onSuccess: (data) => {
      setBulkFilterCount(Number.isFinite(Number(data.count)) ? Number(data.count) : 0)
      setBulkFilterSample(Array.isArray(data.sample_items) ? data.sample_items : [])
    },
    onError: () => {
      setBulkFilterCount(null)
      setBulkFilterSample(null)
      toast.error("Erro ao calcular quantidade do filtro")
    },
  })

  React.useEffect(() => {
    if (!bulkFilterConfirmOpen) {
      setBulkFilterAction(null)
      setBulkFilterCount(null)
      setBulkFilterSample(null)
      return
    }
    setBulkFilterCount(null)
    setBulkFilterSample(null)
    bulkFilteredCountMutation.mutate(filterPayload)
  }, [bulkFilterConfirmOpen, bulkFilteredCountMutation, filterPayload])

  const disapproveMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await api.post(`/api/articles/comments/${commentId}/disapprove/`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success("Comentário marcado como pendente")
    },
    onError: () => {
      toast.error("Erro ao reprovar comentário")
    },
  })

  const approveThreadMutation = useMutation({
    mutationFn: async (rootId: number) => {
      const res = await api.post<{ updated?: number }>(`/api/articles/comments/${rootId}/approve_thread/`)
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Thread aprovada${typeof data?.updated === "number" ? `: ${data.updated}` : ""}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao aprovar thread")
    },
  })

  const disapproveThreadMutation = useMutation({
    mutationFn: async (rootId: number) => {
      const res = await api.post<{ updated?: number }>(`/api/articles/comments/${rootId}/disapprove_thread/`)
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Thread reprovada${typeof data?.updated === "number" ? `: ${data.updated}` : ""}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao reprovar thread")
    },
  })

  const deleteThreadMutation = useMutation({
    mutationFn: async (rootId: number) => {
      const res = await api.post<{ deleted?: number }>(`/api/articles/comments/${rootId}/delete_thread/`)
      return res.data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success(`Thread removida${typeof data?.deleted === "number" ? `: ${data.deleted}` : ""}`)
      clearSelection()
    },
    onError: () => {
      toast.error("Erro ao remover thread")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (commentId: number) => {
      await api.delete(`/api/articles/comments/${commentId}/`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles-comments-moderation"] })
      toast.success("Comentário removido")
    },
    onError: () => {
      toast.error("Erro ao remover comentário")
    },
  })

  const isLoading = commentsQuery.isLoading
  const isEmpty = !isLoading && comments.length === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Moderação de Comentários</h1>
          <p className="text-muted-foreground">Aprove, revise e remova comentários pendentes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={status === "pending" ? "default" : "outline"} onClick={() => setStatus("pending")}>
            Pendentes
          </Button>
          <Button variant={status === "approved" ? "default" : "outline"} onClick={() => setStatus("approved")}>
            Aprovados
          </Button>
          <Button variant={status === "all" ? "default" : "outline"} onClick={() => setStatus("all")}>
            Todos
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="relative max-w-xl" role="search" aria-label="Buscar comentários">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por texto, nome ou email..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">Artigo</div>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              disabled={articlesQuery.isLoading}
            >
              <option value="">Todos</option>
              {(articlesQuery.data ?? []).map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">De</div>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">Até</div>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQuery("")
                setArticleId("")
                setFromDate("")
                setToDate("")
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border/50 bg-background/60 backdrop-blur-sm p-3">
        <div className="text-sm text-muted-foreground">Ações por filtro</div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={bulkIncludeReplies}
              onChange={(e) => setBulkIncludeReplies(e.target.checked)}
            />
            Incluir respostas
          </label>
          <Button
            size="sm"
            onClick={() => {
              setBulkFilterAction("approve")
              setBulkFilterConfirmOpen(true)
            }}
            disabled={bulkApproveFilteredMutation.isPending}
          >
            <Check className="mr-2 h-4 w-4" />
            Aprovar filtro
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setBulkFilterAction("disapprove")
              setBulkFilterConfirmOpen(true)
            }}
            disabled={bulkDisapproveFilteredMutation.isPending}
          >
            <X className="mr-2 h-4 w-4" />
            Reprovar filtro
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => {
              setBulkFilterAction("delete")
              setBulkFilterConfirmOpen(true)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover filtro
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-border/50 bg-background/60 backdrop-blur-sm p-3">
          <div className="text-sm">
            Selecionados: <span className="font-semibold">{selectedIds.size}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={selectAllLoaded}>
              Selecionar carregados
            </Button>
            <Button size="sm" variant="outline" onClick={clearSelection}>
              Limpar seleção
            </Button>
            <Button
              size="sm"
              onClick={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
              disabled={bulkApproveMutation.isPending}
            >
              <Check className="mr-2 h-4 w-4" />
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkDisapproveMutation.mutate(Array.from(selectedIds))}
              disabled={bulkDisapproveMutation.isPending}
            >
              <X className="mr-2 h-4 w-4" />
              Reprovar
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Remover
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border/50 bg-background/60 backdrop-blur-sm">
        <ScrollArea className="h-[calc(100vh-theme(spacing.52))]">
          <div className="divide-y">
            {isLoading && (
              <div className="p-6 flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando comentários...
              </div>
            )}

            {isEmpty && (
              <div className="p-10 text-center text-muted-foreground">Nenhum comentário encontrado.</div>
            )}

            {!isLoading &&
              comments.map((c) => {
                const authorLabel = c.author_name || c.name || "Anônimo"
                const meta = c.email ? `${authorLabel} • ${c.email}` : authorLabel
                const canApprove = !c.is_approved
                const canDisapprove = c.is_approved
                const replyCount = Number.isFinite(Number(c.reply_count)) ? Number(c.reply_count) : 0
                const hasReplies = replyCount > 0
                const articleHref = c.article_slug ? `/artigos/preview/${encodeURIComponent(c.article_slug)}` : "/artigos"
                const publicHref = c.article_slug ? `/p/artigos/${encodeURIComponent(c.article_slug)}` : null

                return (
                  <div
                    id={`comentario-${c.id}`}
                    key={c.id}
                    className={[
                      "p-4 sm:p-6 flex flex-col gap-3 transition-colors",
                      highlightCommentId === c.id ? "bg-primary/5 ring-2 ring-primary/40" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                            aria-label={`Selecionar comentário ${c.id}`}
                          />
                          <Link href={articleHref} className="font-semibold hover:underline">
                            {c.article_title || `Artigo #${c.article}`}
                          </Link>
                          {c.is_approved ? <Badge variant="secondary">Aprovado</Badge> : <Badge>Pendente</Badge>}
                          {c.is_public && (
                            <Badge variant="outline">Comentário público</Badge>
                          )}
                          {!!c.parent && (
                            <Badge variant="outline">Resposta</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {meta} • {new Date(c.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={articleHref}>Abrir artigo</Link>
                        </Button>
                        {publicHref && (
                          <Button asChild size="sm" variant="outline">
                            <Link href={publicHref} target="_blank" rel="noopener noreferrer">
                              Ver público
                            </Link>
                          </Button>
                        )}
                        {(() => {
                          const url = makePublicUrl(c.article_slug, `comentario-${c.id}`)
                          if (!url) return null
                          return (
                            <Button size="sm" variant="outline" onClick={() => copyToClipboard(url)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Copiar link
                            </Button>
                          )
                        })()}
                        {canApprove && (
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(c.id)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Aprovar
                          </Button>
                        )}
                        {canDisapprove && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disapproveMutation.mutate(c.id)}
                            disabled={disapproveMutation.isPending}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Reprovar
                          </Button>
                        )}
                        {hasReplies && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveThreadMutation.mutate(c.id)}
                            disabled={approveThreadMutation.isPending}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Aprovar thread
                          </Button>
                        )}
                        {hasReplies && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disapproveThreadMutation.mutate(c.id)}
                            disabled={disapproveThreadMutation.isPending}
                          >
                            <X className="mr-2 h-4 w-4" />
                            Reprovar thread
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => setCommentToDelete(c)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remover
                        </Button>
                        {hasReplies && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => setThreadToDelete(c)}
                            disabled={deleteThreadMutation.isPending}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover thread
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-muted/20 p-3 whitespace-pre-wrap">
                      {c.content}
                    </div>
                    {(() => {
                      const repliesInitial = Array.isArray(c.replies) ? c.replies : []
                      const state = repliesByParent[c.id]
                      const replies = state?.items?.length ? state.items : repliesInitial
                      const replyCount = Number.isFinite(Number(c.reply_count)) ? Number(c.reply_count) : repliesInitial.length
                      return (
                        <div className="pl-4 border-l border-border/50 space-y-3">
                          {replyCount > replies.length && (
                            <div className="flex">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => loadMoreReplies(c.id)}
                                disabled={state?.isLoading}
                              >
                                {state?.isLoading ? "Carregando..." : `Carregar mais respostas (${replyCount - replies.length})`}
                              </Button>
                            </div>
                          )}
                          {replies.length > 0 &&
                            replies.map((r) => {
                              const authorLabel2 = r.author_name || r.name || "Anônimo"
                              const meta2 = r.email ? `${authorLabel2} • ${r.email}` : authorLabel2
                              const canApprove2 = !r.is_approved
                              const canDisapprove2 = r.is_approved
                              const replyUrl = makePublicUrl(c.article_slug, `resposta-${r.id}`)
                              return (
                                <div key={r.id} className="rounded-xl border border-border/50 bg-background/40 p-3">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        {r.is_approved ? <Badge variant="secondary">Aprovado</Badge> : <Badge>Pendente</Badge>}
                                        <Badge variant="outline">Resposta</Badge>
                                        <Badge variant="outline">Comentário público</Badge>
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {meta2} • {new Date(r.created_at).toLocaleString()}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {replyUrl && (
                                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(replyUrl)}>
                                          <Link2 className="mr-2 h-4 w-4" />
                                          Copiar link
                                        </Button>
                                      )}
                                      {canApprove2 && (
                                        <Button
                                          size="sm"
                                          onClick={() => approveMutation.mutate(r.id)}
                                          disabled={approveMutation.isPending}
                                        >
                                          <Check className="mr-2 h-4 w-4" />
                                          Aprovar
                                        </Button>
                                      )}
                                      {canDisapprove2 && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => disapproveMutation.mutate(r.id)}
                                          disabled={disapproveMutation.isPending}
                                        >
                                          <X className="mr-2 h-4 w-4" />
                                          Reprovar
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-destructive"
                                        onClick={() => setCommentToDelete(r)}
                                        disabled={deleteMutation.isPending}
                                      >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Remover
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-2 whitespace-pre-wrap">{r.content}</div>
                                </div>
                              )
                            })}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

            {commentsQuery.hasNextPage && (
              <div className="p-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => commentsQuery.fetchNextPage()}
                  disabled={commentsQuery.isFetchingNextPage}
                >
                  {commentsQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      <AlertDialog open={!!commentToDelete} onOpenChange={(open) => { if (!open) setCommentToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover comentário</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O comentário será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!commentToDelete) return
                deleteMutation.mutate(commentToDelete.id)
                setCommentToDelete(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!threadToDelete} onOpenChange={(open) => { if (!open) setThreadToDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover thread</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O comentário e todas as respostas serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteThreadMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteThreadMutation.isPending}
              onClick={() => {
                if (!threadToDelete) return
                deleteThreadMutation.mutate(threadToDelete.id)
                setThreadToDelete(null)
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover comentários</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os comentários selecionados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulkDeleteMutation.isPending}
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkFilterConfirmOpen} onOpenChange={setBulkFilterConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkFilterAction === "approve"
                ? "Aprovar comentários (filtro)"
                : bulkFilterAction === "disapprove"
                  ? "Reprovar comentários (filtro)"
                  : "Remover comentários (filtro)"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkFilterCount === null
                ? "Calculando quantidade de comentários no filtro..."
                : `Comentários afetados: ${bulkFilterCount}${bulkIncludeReplies ? " (inclui respostas)." : "."}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {Array.isArray(bulkFilterSample) && bulkFilterSample.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-border/50 bg-muted/20 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">Amostra (até {bulkFilterSample.length} itens)</div>
              {bulkFilterSample.slice(0, 10).map((it) => {
                const isReply = Boolean(it.parent)
                const title = it.article_title || "Artigo"
                const snippet = (it.content || "").trim().slice(0, 120)
                return (
                  <div key={it.id} className="rounded-lg border border-border/50 bg-background/40 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isReply ? <Badge variant="outline">Resposta</Badge> : <Badge variant="outline">Comentário</Badge>}
                      <div className="text-sm font-medium">{title}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      #{it.id} • {new Date(it.created_at).toLocaleString()}
                    </div>
                    {snippet && <div className="mt-2 text-sm whitespace-pre-wrap">{snippet}</div>}
                  </div>
                )
              })}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={
                bulkApproveFilteredMutation.isPending ||
                bulkDisapproveFilteredMutation.isPending ||
                bulkDeleteFilteredMutation.isPending ||
                bulkFilteredCountMutation.isPending
              }
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant={bulkFilterAction === "delete" ? "destructive" : "default"}
              disabled={
                bulkFilterCount === null ||
                bulkFilteredCountMutation.isPending ||
                bulkApproveFilteredMutation.isPending ||
                bulkDisapproveFilteredMutation.isPending ||
                bulkDeleteFilteredMutation.isPending
              }
              onClick={() => {
                if (bulkFilterAction === "approve") bulkApproveFilteredMutation.mutate()
                else if (bulkFilterAction === "disapprove") bulkDisapproveFilteredMutation.mutate()
                else bulkDeleteFilteredMutation.mutate()
              }}
            >
              {bulkFilterAction === "approve"
                ? "Aprovar"
                : bulkFilterAction === "disapprove"
                  ? "Reprovar"
                  : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
