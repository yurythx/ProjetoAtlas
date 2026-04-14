"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { Article } from "@/types"
import { PublicArticleCard } from "@/components/public/article-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Search, BookOpen, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/axios"
import { useRouter, useSearchParams } from "next/navigation"
import { useDebounce } from "@/hooks/use-debounce"

export default function PublicArtigosPage() {
    const searchParams = useSearchParams()
    const router = useRouter()

    useEffect(() => {
        const hasTokens = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))
        if (hasTokens) router.replace("/artigos")
    }, [router])

    const companySlugFromQuery = (searchParams.get("company_slug") || "").trim() || null
    const filterCompanySlug = companySlugFromQuery

    const searchFromQuery = useMemo(() => searchParams.get("search") ?? "", [searchParams])
    const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') ?? "")
    const debouncedSearchTerm = useDebounce(searchTerm, 500)

    useEffect(() => {
        setSearchTerm(searchFromQuery)
    }, [searchFromQuery])

    useEffect(() => {
        const params = new URLSearchParams()
        const normalizedSearch = debouncedSearchTerm.trim()
        if (normalizedSearch) params.set('search', normalizedSearch)
        if (filterCompanySlug) params.set('company_slug', filterCompanySlug)
        const qs = params.toString()
        router.replace(qs ? `?${qs}` : "/p/artigos", { scroll: false })
    }, [debouncedSearchTerm, router, filterCompanySlug])

    const {
        data,
        isLoading,
        error,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
    } = useInfiniteQuery({
        queryKey: ['public-articles', filterCompanySlug, debouncedSearchTerm],
        queryFn: async ({ pageParam, signal }) => {
            const params = new URLSearchParams()
            if (debouncedSearchTerm.trim()) params.set('search', debouncedSearchTerm.trim())
            params.set('page_size', '30')
            if (pageParam) params.set('page', String(pageParam))
            if (filterCompanySlug) params.set("company_slug", filterCompanySlug)
            const res = await api.get('/api/articles/public/articles/', {
                params,
                signal,
                headers: filterCompanySlug ? { "X-Company-Slug": filterCompanySlug } : {},
            })
            return res.data
        },
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const next = lastPage?.next
            if (!next) return undefined
            try {
                const u = new URL(next)
                const p = u.searchParams.get('page')
                return p ? Number(p) : undefined
            } catch {
                const m = /[?&]page=(\d+)/.exec(next)
                return m ? Number(m[1]) : undefined
            }
        },
        staleTime: 5 * 60 * 1000,
        retry: 1,
        enabled: true,
    })

    const articles: Article[] = useMemo(() => {
        const pages = data?.pages ?? []
        const out: Article[] = []
        for (const pg of pages as unknown[]) {
            if (Array.isArray(pg)) {
                out.push(...(pg as Article[]))
                continue
            }
            const p = pg as { results?: unknown }
            const results = p?.results
            if (Array.isArray(results)) out.push(...(results as Article[]))
        }
        return out
    }, [data])

    return (
        <>
            <div className="py-8 sm:py-12 space-y-8 sm:space-y-12">
                {/* Header */}
                <header className="flex flex-col gap-4 text-center max-w-3xl mx-auto">
                    <div className="flex items-center justify-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <BookOpen className="h-6 w-6 text-primary" aria-hidden="true" />
                        </div>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Artigos e Novidades
                    </h1>
                    <p className="text-muted-foreground text-base sm:text-lg">
                        Fique por dentro das últimas novidades, tutoriais e conteúdos exclusivos.
                    </p>
                </header>

                <div
                    className="sticky top-4 z-10 bg-background/80 backdrop-blur-md p-4 rounded-2xl border shadow-sm max-w-3xl mx-auto"
                    role="search"
                    aria-label="Pesquisar artigos"
                >
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                        <Input
                            type="search"
                            placeholder="Buscar por título ou conteúdo..."
                            className="pl-11 h-12 rounded-xl bg-card border-muted hover:border-primary/30 focus-visible:ring-primary/20 transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label="Buscar artigos"
                        />
                        {searchTerm.trim() && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-xl hover:bg-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                aria-label="Limpar busca"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="text-center py-12 border-2 border-destructive/20 rounded-3xl bg-destructive/5" role="alert" aria-live="assertive" aria-label="Erro ao carregar artigos">
                        <p className="text-destructive font-medium">
                            Erro ao carregar artigos. Tente novamente mais tarde.
                        </p>
                    </div>
                )}

                {/* Loading State */}
                {isLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6" role="status" aria-live="polite" aria-label="Carregando artigos">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="space-y-4">
                                <Skeleton className="aspect-video w-full rounded-2xl" />
                                <div className="space-y-2">
                                    <Skeleton className="h-6 w-3/4" />
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-5/6" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Articles Grid */}
                {!isLoading && !error && articles.length > 0 && (
                    <>
                        <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
                            role="list"
                            aria-label={`${articles.length} artigos encontrados`}
                        >
                            {articles.map((article: Article, idx: number) => (
                                <PublicArticleCard key={article.id} article={article} priority={idx < 2} />
                            ))}
                        </div>

                        {/* Results Count */}
                        <div className="text-center text-sm text-muted-foreground" role="status" aria-live="polite">
                            Mostrando {articles.length} {articles.length === 1 ? 'artigo' : 'artigos'}
                            {debouncedSearchTerm.trim() && ` com "${debouncedSearchTerm.trim()}"`}
                        </div>

                        {hasNextPage && (
                            <div className="flex justify-center pt-2">
                                <button
                                    type="button"
                                    onClick={() => fetchNextPage()}
                                    disabled={isFetchingNextPage}
                                    className="h-12 px-6 rounded-2xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                >
                                    {isFetchingNextPage ? "Carregando..." : "Carregar mais"}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* Empty State */}
                {!isLoading && !error && articles.length === 0 && (
                    <div className="text-center py-16 sm:py-20 border-2 border-dashed rounded-3xl bg-muted/10">
                        <div className="h-16 w-16 rounded-full bg-muted/30 mx-auto mb-4 flex items-center justify-center">
                            <BookOpen className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Nenhum artigo encontrado</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            {debouncedSearchTerm.trim()
                                ? `Não encontramos artigos com "${debouncedSearchTerm.trim()}". Tente ajustar sua busca ou limpar o filtro.`
                                : "Nenhum artigo público disponível no momento. Volte em breve!"}
                        </p>
                        {searchTerm.trim() && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm("")}
                                className="mt-4 text-primary hover:underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
                                aria-label="Limpar busca"
                            >
                                Limpar busca
                            </button>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}
