"use client"

import * as React from "react"
import Link from "next/link"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { useAuth } from "@/hooks/use-auth"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Check, Loader2, Search, X } from "lucide-react"
import { toast } from "sonner"

type ArticleLite = {
  id: number
  title: string
  slug: string
  excerpt?: string | null
  created_at?: string | null
  updated_at?: string | null
  category_name?: string | null
  author_name?: string | null
  is_public?: boolean
  status?: string
}

type Category = { id: number; name: string }

type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

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

export function ArticleModeration() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canModerate = Boolean(
    user?.is_superuser || user?.role_details?.permissions?.includes("articles.article_publish")
  )

  const [query, setQuery] = React.useState("")
  const debounced = React.useMemo(() => query.trim(), [query])
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectReason, setRejectReason] = React.useState("")
  const [rejectTargets, setRejectTargets] = React.useState<ArticleLite[]>([])
  const [status, setStatus] = React.useState<"pending" | "rejected" | "all">("pending")
  const [visibility, setVisibility] = React.useState<"all" | "public" | "private">("all")
  const [categoryId, setCategoryId] = React.useState<string>("all")
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(new Set())
  const selectedCount = selectedIds.size

  const categoriesQuery = useQuery({
    queryKey: ["articles-categories-lite"],
    queryFn: async ({ signal }) => {
      const res = await api.get<Category[] | { results: Category[] }>("/api/articles/categories/", { signal })
      const data = res.data
      const list = Array.isArray(data) ? data : (data.results || [])
      return Array.isArray(list) ? list : []
    },
    enabled: canModerate,
    staleTime: 10 * 60_000,
    retry: 1,
  })
  const categories = categoriesQuery.data ?? []

  const pendingQuery = useInfiniteQuery<Paginated<ArticleLite>>({
    queryKey: ["articles-moderation", status, visibility, categoryId, debounced],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const safePage = typeof pageParam === "number" ? pageParam : Number(pageParam)
      const params: Record<string, string | number> = {
        ordering: "-updated_at",
        page: Number.isFinite(safePage) && safePage > 0 ? safePage : 1,
        page_size: 18,
      }
      if (status !== "all") params.status = status
      if (visibility === "public") params.is_public = "true"
      if (visibility === "private") params.is_public = "false"
      if (categoryId !== "all") params.category = categoryId
      if (debounced) params.search = debounced
      const res = await api.get<Paginated<ArticleLite>>("/api/articles/articles/", { params, signal })
      return res.data
    },
    getNextPageParam: (lastPage) => parsePageParam(lastPage.next),
    enabled: canModerate,
    retry: 1,
  })

  const items = React.useMemo(() => {
    const pages = pendingQuery.data?.pages ?? []
    return pages.flatMap((p) => p.results)
  }, [pendingQuery.data])

  React.useEffect(() => {
    setSelectedIds(new Set())
  }, [status, visibility, categoryId, debounced])

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const ids = items.map((a) => a.id)
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(ids)
    })
  }

  const runInBatches = async <T,>(
    tasks: Array<() => Promise<T>>,
    concurrency: number
  ): Promise<Array<PromiseSettledResult<T>>> => {
    const results: Array<PromiseSettledResult<T>> = new Array(tasks.length)
    let cursor = 0

    const worker = async () => {
      while (cursor < tasks.length) {
        const idx = cursor
        cursor += 1
        try {
          const v = await tasks[idx]()
          results[idx] = { status: "fulfilled", value: v }
        } catch (e) {
          results[idx] = { status: "rejected", reason: e }
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))
    return results
  }

  const approveMutation = useMutation({
    mutationFn: async (slug: string) => {
      await api.post(`/api/articles/articles/${encodeURIComponent(slug)}/publish/`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles-moderation"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-articles-grid"] })
      toast.success("Artigo aprovado e publicado")
    },
    onError: () => {
      toast.error("Falha ao aprovar artigo")
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ slug, reason }: { slug: string; reason: string }) => {
      await api.post(`/api/articles/articles/${encodeURIComponent(slug)}/reject/`, { reason })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["articles-moderation"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-articles-grid"] })
      toast.success("Artigo rejeitado")
    },
    onError: () => {
      toast.error("Falha ao rejeitar artigo")
    },
  })

  const bulkApproveMutation = useMutation({
    mutationFn: async (slugs: string[]) => {
      try {
        const res = await api.post<{ approved?: string[]; failed?: unknown[] }>(
          "/api/articles/articles/bulk/publish/",
          { slugs }
        )
        const approved = Array.isArray(res.data?.approved) ? res.data.approved : []
        const failed = Array.isArray(res.data?.failed) ? res.data.failed : []
        const failedSlugs = failed
          .map((f) => (typeof f === "object" && f && "slug" in f ? (f as { slug?: unknown }).slug : null))
          .filter((s): s is string => typeof s === "string" && s.length > 0)
        return { ok: approved.length, fail: failed.length, failedSlugs }
      } catch {
        const tasks = slugs.map((slug) => () =>
          api.post(`/api/articles/articles/${encodeURIComponent(slug)}/publish/`)
        )
        const results = await runInBatches(tasks, 3)
        const ok = results.filter((r) => r.status === "fulfilled").length
        const fail = results.length - ok
        return { ok, fail, failedSlugs: [] as string[] }
      }
    },
    onSuccess: async ({ ok, fail, failedSlugs }) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-moderation"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-articles-grid"] })
      setSelectedIds(new Set())
      if (fail === 0) toast.success(`${ok} artigos aprovados`)
      else {
        const sample = failedSlugs.slice(0, 3)
        const suffix = sample.length ? ` (${sample.join(", ")})` : ""
        toast.warning(`${ok} aprovados, ${fail} falharam${suffix}`)
      }
    },
    onError: () => {
      toast.error("Falha ao aprovar em lote")
    },
  })

  const bulkRejectMutation = useMutation({
    mutationFn: async ({ slugs, reason }: { slugs: string[]; reason: string }) => {
      try {
        const res = await api.post<{ rejected?: string[]; failed?: unknown[] }>(
          "/api/articles/articles/bulk/reject/",
          { slugs, reason }
        )
        const rejected = Array.isArray(res.data?.rejected) ? res.data.rejected : []
        const failed = Array.isArray(res.data?.failed) ? res.data.failed : []
        const failedSlugs = failed
          .map((f) => (typeof f === "object" && f && "slug" in f ? (f as { slug?: unknown }).slug : null))
          .filter((s): s is string => typeof s === "string" && s.length > 0)
        return { ok: rejected.length, fail: failed.length, failedSlugs }
      } catch {
        const tasks = slugs.map((slug) => () =>
          api.post(`/api/articles/articles/${encodeURIComponent(slug)}/reject/`, { reason })
        )
        const results = await runInBatches(tasks, 3)
        const ok = results.filter((r) => r.status === "fulfilled").length
        const fail = results.length - ok
        return { ok, fail, failedSlugs: [] as string[] }
      }
    },
    onSuccess: async ({ ok, fail, failedSlugs }) => {
      await queryClient.invalidateQueries({ queryKey: ["articles-moderation"] })
      await queryClient.invalidateQueries({ queryKey: ["dashboard-articles-grid"] })
      setSelectedIds(new Set())
      if (fail === 0) toast.success(`${ok} artigos rejeitados`)
      else {
        const sample = failedSlugs.slice(0, 3)
        const suffix = sample.length ? ` (${sample.join(", ")})` : ""
        toast.warning(`${ok} rejeitados, ${fail} falharam${suffix}`)
      }
    },
    onError: () => {
      toast.error("Falha ao rejeitar em lote")
    },
  })

  const isMutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    bulkApproveMutation.isPending ||
    bulkRejectMutation.isPending

  const openReject = (articles: ArticleLite[]) => {
    setRejectTargets(articles)
    setRejectReason("")
    setRejectOpen(true)
  }

  const submitReject = () => {
    const reason = rejectReason.trim()
    if (rejectTargets.length === 0) return
    if (rejectTargets.length === 1) {
      rejectMutation.mutate({ slug: rejectTargets[0].slug, reason })
    } else {
      bulkRejectMutation.mutate({ slugs: rejectTargets.map((a) => a.slug), reason })
    }
    setRejectOpen(false)
    setRejectTargets([])
    setRejectReason("")
  }

  if (!canModerate) {
    return (
      <div className="text-center py-16 sm:py-20 border-2 border-dashed rounded-3xl bg-muted/10">
        <h3 className="text-lg font-semibold mb-2">Moderação de Artigos</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Você não tem permissão para aprovar/rejeitar artigos.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-6" aria-label="Moderação de Artigos">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Moderação</h2>
          <p className="text-muted-foreground">
            Aprove ou rejeite artigos enviados para revisão.
          </p>
        </div>
        <div className="w-full md:w-[640px] grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-3 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, resumo ou conteúdo..."
              className="pl-11 h-11 rounded-xl bg-card border-muted hover:border-primary/30 shadow-sm"
            />
          </div>
          <div className="md:col-span-1">
            <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "rejected" | "all")}>
              <SelectTrigger className="h-11 rounded-xl bg-card border-muted hover:border-primary/30 shadow-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border shadow-xl p-1">
                <SelectItem value="pending" className="rounded-lg cursor-pointer">Pendente</SelectItem>
                <SelectItem value="rejected" className="rounded-lg cursor-pointer">Rejeitado</SelectItem>
                <SelectItem value="all" className="rounded-lg cursor-pointer">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Select value={visibility} onValueChange={(v) => setVisibility(v as "all" | "public" | "private")}>
              <SelectTrigger className="h-11 rounded-xl bg-card border-muted hover:border-primary/30 shadow-sm">
                <SelectValue placeholder="Visibilidade" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border shadow-xl p-1">
                <SelectItem value="all" className="rounded-lg cursor-pointer">Todos</SelectItem>
                <SelectItem value="public" className="rounded-lg cursor-pointer">Público</SelectItem>
                <SelectItem value="private" className="rounded-lg cursor-pointer">Privado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11 rounded-xl bg-card border-muted hover:border-primary/30 shadow-sm">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border shadow-xl p-1">
                <SelectItem value="all" className="rounded-lg cursor-pointer">Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)} className="rounded-lg cursor-pointer">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {pendingQuery.isLoading && (
        <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        </div>
      )}

      {pendingQuery.isError && (
        <div className="text-center py-12 border-2 border-destructive/20 rounded-3xl bg-destructive/5" role="alert" aria-live="assertive">
          <p className="text-destructive font-medium">Erro ao carregar fila de moderação.</p>
        </div>
      )}

      {!pendingQuery.isLoading && !pendingQuery.isError && items.length === 0 && (
        <div className="text-center py-16 sm:py-20 border-2 border-dashed rounded-3xl bg-muted/10">
          <h3 className="text-lg font-semibold mb-2">Nenhum artigo pendente</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Nenhum resultado para os filtros selecionados.
          </p>
        </div>
      )}

      {!pendingQuery.isLoading && !pendingQuery.isError && items.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border bg-card/40 backdrop-blur p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={items.length > 0 && items.every((a) => selectedIds.has(a.id))}
                onChange={toggleSelectAll}
                aria-label="Selecionar todos"
              />
              <div className="text-sm text-muted-foreground">
                {selectedCount > 0 ? `${selectedCount} selecionado(s)` : `${items.length} resultado(s)`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="gap-2"
                disabled={selectedCount === 0 || isMutating}
                onClick={() => {
                  const slugs = items.filter((a) => selectedIds.has(a.id)).map((a) => a.slug)
                  bulkApproveMutation.mutate(slugs)
                }}
              >
                {bulkApproveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Aprovar selecionados
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="gap-2"
                disabled={selectedCount === 0 || isMutating}
                onClick={() => openReject(items.filter((a) => selectedIds.has(a.id)))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Rejeitar selecionados
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" role="list" aria-label="Artigos em moderação">
            {items.map((a) => (
              <div key={a.id} className="rounded-2xl border bg-card/40 backdrop-blur p-5 shadow-sm" role="listitem">
                <div className="flex items-start justify-between gap-4">
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      aria-label={`Selecionar ${a.title}`}
                    />
                  </div>
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px]">
                        {(a.status || status) === "rejected" ? "Rejeitado" : (a.status || status) === "pending" ? "Pendente" : "Status"}
                      </Badge>
                      {a.category_name && (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px]">
                          {a.category_name}
                        </Badge>
                      )}
                      {a.is_public === false && (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px]">
                          Privado
                        </Badge>
                      )}
                      {a.is_public === true && (
                        <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px]">
                          Público
                        </Badge>
                      )}
                    </div>
                    <div className="font-bold text-lg leading-tight truncate">{a.title}</div>
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      {a.excerpt || "Sem resumo."}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.author_name ? `Autor: ${a.author_name}` : "Autor não informado"}
                    </div>
                  </div>
                  <Link
                    href={`/artigos/preview/${encodeURIComponent(a.slug)}`}
                    className="text-primary hover:underline text-sm shrink-0"
                  >
                    Ver
                  </Link>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={isMutating}
                    onClick={() => approveMutation.mutate(a.slug)}
                  >
                    {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="gap-2"
                    disabled={isMutating}
                    onClick={() => openReject([a])}
                  >
                    <X className="h-4 w-4" aria-hidden="true" /> Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {pendingQuery.hasNextPage && (
            <div className="flex items-center justify-center pt-2">
              <button
                type="button"
                className="h-10 px-6 rounded-full border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                onClick={() => pendingQuery.fetchNextPage()}
                disabled={pendingQuery.isFetchingNextPage}
                aria-label="Carregar mais pendentes"
              >
                {pendingQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
              </button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar artigo</AlertDialogTitle>
            <AlertDialogDescription>
              Informe o motivo da rejeição (opcional). Isso ajuda o autor a corrigir o conteúdo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motivo da rejeição..."
              className="min-h-[120px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={submitReject}
            >
              {(rejectMutation.isPending || bulkRejectMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Rejeitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
