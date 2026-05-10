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
import { cn } from "@/lib/utils"

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
    <section className="space-y-8 animate-in fade-in duration-700" aria-label="Moderação de Artigos">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] shadow-xl">
        <div className="space-y-1">
          <h2 className="text-3xl font-black tracking-tighter">Moderação Editorial</h2>
          <p className="text-muted-foreground font-medium">
            Fluxo de aprovação ITIL para controle de qualidade de conteúdo.
          </p>
        </div>
        <div className="w-full md:w-auto flex flex-col md:flex-row gap-3">
          <div className="relative group min-w-[280px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar na fila..."
              className="pl-11 h-12 rounded-xl bg-white/5 border-white/10 hover:border-primary/30 transition-all shadow-inner"
            />
          </div>
          <div className="flex gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "rejected" | "all")}>
              <SelectTrigger className="h-12 w-32 rounded-xl bg-white/5 border-white/10 hover:border-primary/30 shadow-inner">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl p-1">
                <SelectItem value="pending" className="rounded-xl cursor-pointer">Pendente</SelectItem>
                <SelectItem value="rejected" className="rounded-xl cursor-pointer">Rejeitado</SelectItem>
                <SelectItem value="all" className="rounded-xl cursor-pointer">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as "all" | "public" | "private")}>
              <SelectTrigger className="h-12 w-32 rounded-xl bg-white/5 border-white/10 hover:border-primary/30 shadow-inner">
                <SelectValue placeholder="Visão" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl p-1">
                <SelectItem value="all" className="rounded-xl cursor-pointer">Todos</SelectItem>
                <SelectItem value="public" className="rounded-xl cursor-pointer">Público</SelectItem>
                <SelectItem value="private" className="rounded-xl cursor-pointer">Privado</SelectItem>
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl relative overflow-hidden group/bulk">
             <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/bulk:opacity-100 transition-opacity duration-500" />
            <div className="flex items-center gap-4 relative z-10">
              <input
                type="checkbox"
                className="h-5 w-5 rounded-md border-white/20 bg-white/5 cursor-pointer accent-primary"
                checked={items.length > 0 && items.every((a) => selectedIds.has(a.id))}
                onChange={toggleSelectAll}
                aria-label="Selecionar todos"
              />
              <div className="text-sm font-bold tracking-tight">
                {selectedCount > 0 ? `${selectedCount} item(ns) selecionado(s)` : `${items.length} resultado(s)`}
              </div>
            </div>
            <div className="flex items-center gap-3 relative z-10">
              <Button
                type="button"
                className="rounded-xl h-11 px-6 font-black uppercase tracking-widest text-[11px] shadow-lg shadow-primary/20"
                disabled={selectedCount === 0 || isMutating}
                onClick={() => {
                  const slugs = items.filter((a) => selectedIds.has(a.id)).map((a) => a.slug)
                  bulkApproveMutation.mutate(slugs)
                }}
              >
                {bulkApproveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-2" aria-hidden="true" />}
                Aprovar Lote
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-xl h-11 px-6 font-black uppercase tracking-widest text-[11px] shadow-lg shadow-rose-500/20"
                disabled={selectedCount === 0 || isMutating}
                onClick={() => openReject(items.filter((a) => selectedIds.has(a.id)))}
              >
                <X className="h-4 w-4 mr-2" aria-hidden="true" />
                Rejeitar Lote
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" role="list" aria-label="Artigos">
            {items.map((a) => (
              <div key={a.id} className="group/item relative rounded-[2rem] border border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-500 p-6 shadow-xl" role="listitem">
                <div className="flex items-start gap-5">
                  <div className="pt-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded-md border-white/20 bg-white/5 cursor-pointer accent-primary"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      aria-label={`Selecionar ${a.title}`}
                    />
                  </div>
                  <div className="space-y-3 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={cn("rounded-full px-4 py-1 text-[9px] font-black uppercase tracking-widest border border-white/10 shadow-sm", 
                        (a.status || status) === "pending" ? "bg-amber-500/20 text-amber-500" : "bg-rose-500/20 text-rose-500")}>
                        {(a.status || status) === "rejected" ? "Rejeitado" : (a.status || status) === "pending" ? "Pendente" : "Status"}
                      </Badge>
                      {a.category_name && (
                        <Badge variant="outline" className="rounded-full px-4 py-1 text-[9px] font-black uppercase tracking-widest border-white/10 bg-white/5">
                          {a.category_name}
                        </Badge>
                      )}
                    </div>
                    <div className="font-black text-xl tracking-tighter leading-tight group-hover/item:text-primary transition-colors">{a.title}</div>
                    <div className="text-sm text-muted-foreground font-medium line-clamp-2 leading-relaxed">
                      {a.excerpt || "Sem resumo editorial disponível."}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                      Autor: <span className="text-foreground/70">{a.author_name || "Desconhecido"}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="rounded-xl h-10 px-4 font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/10">
                    <Link href={`/artigos/preview/${encodeURIComponent(a.slug)}`}>Ver</Link>
                  </Button>
                </div>

                <div className="mt-6 flex gap-3">
                  <Button
                    type="button"
                    className="flex-1 rounded-xl h-11 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/10"
                    disabled={isMutating}
                    onClick={() => approveMutation.mutate(a.slug)}
                  >
                    {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-2" aria-hidden="true" />}
                    Aprovar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="flex-1 rounded-xl h-11 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-500/10"
                    disabled={isMutating}
                    onClick={() => openReject([a])}
                  >
                    <X className="h-4 w-4 mr-2" aria-hidden="true" /> Rejeitar
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
