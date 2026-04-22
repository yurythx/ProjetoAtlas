"use client"

import { useState, useEffect, Suspense, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useInfiniteQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import dynamic from "next/dynamic"
import { Article, Category } from "@/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PublicArticleCard } from "@/components/public/article-card"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, BookOpen, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { ModuleGuard } from "@/components/module-guard"
import { ArticleModeration } from "@/features/articles/article-moderation"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useDebounce } from "@/hooks/use-debounce"

const TagList = dynamic(
    () => import("@/features/articles/tag-list").then((m) => m.TagList),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando tags e categorias">
                <Skeleton className="h-10 w-64 rounded-2xl" />
                <Skeleton className="h-[520px] w-full rounded-2xl" />
            </div>
        ),
    }
)

const ArticleAnalytics = dynamic(
    () => import("@/features/articles/article-analytics").then((m) => m.ArticleAnalytics),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando analytics de artigos">
                <Skeleton className="h-10 w-64 rounded-2xl" />
                <Skeleton className="h-[520px] w-full rounded-2xl" />
            </div>
        ),
    }
)

function ArtigosPageContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? "")
    const debouncedSearchTerm = useDebounce(searchTerm, 250)
    const [visibility, setVisibility] = useState<'all' | 'private' | 'pending'>(() => {
        const v = searchParams.get('v')
        if (v === 'private') return 'private'
        if (v === 'pending') return 'pending'
        return 'all'
    })
    const [activeTab, setActiveTab] = useState<'articles' | 'tags' | 'analytics' | 'moderation'>(() => {
        const t = (searchParams.get("tab") || "").toLowerCase()
        if (t === "moderation") return "moderation"
        if (t === "tags") return "tags"
        if (t === "analytics") return "analytics"
        return "articles"
    })
    const [categoryId, setCategoryId] = useState<number | null>(() => {
        const raw = searchParams.get('category')
        const n = raw ? Number(raw) : NaN
        return Number.isFinite(n) && n > 0 ? n : null
    })

    const { user: me, isLoading } = useAuth()

    const { data: categories } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: async () => {
            const res = await api.get<Category[] | { results: Category[] }>('/api/articles/categories/')
            const data = Array.isArray(res.data) ? res.data : res.data.results || []
            return Array.isArray(data) ? data : []
        }
    })

    const {
        data,
        isFetching,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        error,
    } = useInfiniteQuery({
        queryKey: ['dashboard-articles-grid', visibility, debouncedSearchTerm, categoryId],
        queryFn: async ({ pageParam }) => {
            const params = new URLSearchParams()
            if (visibility === 'private') params.set('is_public', 'false')
            if (visibility === 'pending') params.set('status', 'pending')
            if (debouncedSearchTerm.trim()) params.set('search', debouncedSearchTerm.trim())
            if (categoryId) params.set('category', String(categoryId))
            if (pageParam) params.set('page', String(pageParam))
            const url = `/api/articles/articles/?${params.toString()}`
            const res = await api.get(url)
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
        enabled: !isLoading && !!me,
    })
    const list: Article[] = (data?.pages ?? []).flatMap((pg: unknown) => {
        if (Array.isArray(pg)) return pg as Article[]
        const p = pg as { results?: unknown }
        return Array.isArray(p?.results) ? (p.results as Article[]) : []
    })

    const {
        data: publicData,
        isFetchingNextPage: isFetchingNextPagePublic,
        fetchNextPage: fetchNextPagePublic,
        hasNextPage: hasNextPagePublic,
    } = useInfiniteQuery({
        queryKey: ['dashboard-public-articles', debouncedSearchTerm, categoryId],
        queryFn: async ({ pageParam }) => {
            const params = new URLSearchParams()
            if (debouncedSearchTerm.trim()) params.set('search', debouncedSearchTerm.trim())
            if (categoryId) params.set('category', String(categoryId))
            if (pageParam) params.set('page', String(pageParam))
            const res = await api.get('/api/articles/public/articles/', { params })
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
        enabled: !isLoading && !!me && visibility === 'all',
    })
    
    type PublicArticle = {
        id: number
        title: string
        slug: string
        content?: string
        excerpt?: string
        image?: string | null
        cover_image?: string | null
        category_name?: string | null
        tags?: string[]
        meta_title?: string | null
        meta_description?: string | null
        published_at?: string | null
        created_at?: string | null
        updated_at?: string | null
        author_name?: string | null
        company_name?: string | null
        company_slug?: string | null
    }
    const publicListRaw: PublicArticle[] = (publicData?.pages ?? []).flatMap((pg: unknown) => {
        if (Array.isArray(pg)) return pg as PublicArticle[]
        const p = pg as { results?: unknown }
        return Array.isArray(p?.results) ? (p.results as PublicArticle[]) : []
    })
    const publicList: Article[] = publicListRaw.map((a: PublicArticle) => ({
        ...(a as unknown as Article),
        is_public: true,
        status: 'published',
    })) as Article[]

    const mergedList: Article[] = useMemo(() => {
        if (visibility === 'private') {
            return list.filter((a: Article) => a?.is_public === false)
        }
        const map = new Map<string, Article>()
        for (const a of list) {
            if (typeof a.slug === 'string') map.set(a.slug, a)
        }
        for (const b of publicList) {
            if (typeof b.slug === 'string' && !map.has(b.slug)) {
                map.set(b.slug, b)
            }
        }
        const arr = Array.from(map.values())
        arr.sort((a: Article, b: Article) => {
            const ad = new Date((a as unknown as { published_at?: string }).published_at || a.created_at || 0).getTime()
            const bd = new Date((b as unknown as { published_at?: string }).published_at || b.created_at || 0).getTime()
            return bd - ad
        })
        return arr
    }, [visibility, list, publicList])

    useEffect(() => {
        const params = new URLSearchParams()
        if (debouncedSearchTerm.trim()) params.set('q', debouncedSearchTerm.trim())
        if (visibility === 'private') params.set('v', 'private')
        if (categoryId) params.set('category', String(categoryId))
        const qs = params.toString()
        router.replace(qs ? `?${qs}` : '?', { scroll: false })
    }, [debouncedSearchTerm, visibility, categoryId, router])

    useEffect(() => {
        const q = searchParams.get('q') ?? ""
        const v = searchParams.get('v') === 'private' ? 'private' : 'all'
        const cRaw = searchParams.get('category')
        const cNum = cRaw ? Number(cRaw) : NaN
        const c = Number.isFinite(cNum) && cNum > 0 ? cNum : null
        if (q !== searchTerm) setSearchTerm(q)
        if (v !== visibility) setVisibility(v)
        if (c !== categoryId) setCategoryId(c)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams])

    if (isLoading || !me) {
        return <div className="flex items-center justify-center h-full">Carregando...</div>
    }

    return (
        <div className="h-full space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12">
                   <BookOpen className="h-40 w-40 text-primary" />
                </div>
                <div className="relative z-10 space-y-2">
                    <h1 className="text-5xl font-black tracking-tighter flex items-center gap-6">
                        <div className="h-16 w-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                            <BookOpen className="h-8 w-8 text-primary" />
                        </div>
                        Centro de Conteúdo
                    </h1>
                    <p className="text-muted-foreground text-lg font-medium max-w-xl">Gestão editorial, base de conhecimento e comunicação estratégica do ecossistema Atlas.</p>
                </div>
                <div className="flex items-center gap-4 relative z-10">
                    <Button
                        variant="outline"
                        asChild
                        className="rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 font-black uppercase tracking-widest h-14 px-8 shadow-lg"
                    >
                        <Link href="/artigos/novo" className="flex items-center gap-3">
                            <Plus className="h-5 w-5 text-primary" aria-hidden="true" />
                            Novo Artigo
                        </Link>
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'articles' | 'tags' | 'analytics' | 'moderation')} className="w-full">
                <TabsList className="bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md mb-8">
                    <TabsTrigger value="articles" className="rounded-xl px-8 h-12 font-black uppercase tracking-widest text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">Artigos</TabsTrigger>
                    <TabsTrigger value="tags" className="rounded-xl px-8 h-12 font-black uppercase tracking-widest text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">Tags & Categorias</TabsTrigger>
                    <TabsTrigger value="moderation" className="rounded-xl px-8 h-12 font-black uppercase tracking-widest text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">Moderação</TabsTrigger>
                    <TabsTrigger value="analytics" className="rounded-xl px-8 h-12 font-black uppercase tracking-widest text-[11px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all duration-300">Analytics</TabsTrigger>
                </TabsList>

                <TabsContent value="articles" className="mt-6">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
                        <div className="relative flex-1 group" role="search" aria-label="Pesquisar artigos">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all group-focus-within:text-primary group-focus-within:scale-110" aria-hidden="true" />
                            <Input
                                type="search"
                                placeholder="Buscar no acervo de conhecimento..."
                                className="pl-14 h-16 rounded-2xl bg-white/5 backdrop-blur-md border-white/10 focus-visible:ring-primary/20 text-lg font-medium"
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value) }}
                                aria-label="Buscar artigos"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className={`h-10 px-3 rounded-full text-sm font-medium border ${visibility === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}
                                onClick={() => { setVisibility('all') }}
                            >
                                Todos
                            </button>
                            <button
                                type="button"
                                className={`h-10 px-3 rounded-full text-sm font-medium border ${visibility === 'private' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}
                                onClick={() => { setVisibility('private') }}
                            >
                                Privado
                            </button>
                            <button
                                type="button"
                                className={`h-10 px-3 rounded-full text-sm font-medium border ${visibility === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-background border-border'}`}
                                onClick={() => { setVisibility('pending') }}
                            >
                                Pendente
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 overflow-x-auto pb-4 mb-8 scrollbar-hide">
                        <Button
                            variant={categoryId === null ? 'default' : 'outline'}
                            onClick={() => setCategoryId(null)}
                            className={cn("h-10 px-6 rounded-full text-[11px] font-black uppercase tracking-widest transition-all", categoryId === null ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white/5 border-white/10 text-muted-foreground hover:text-foreground')}
                            aria-label="Todas as categorias"
                        >
                            Todas as categorias
                        </Button>
                        {categories?.map((cat) => (
                            <Button
                                key={cat.id}
                                variant={categoryId === cat.id ? 'default' : 'outline'}
                                onClick={() => setCategoryId(cat.id)}
                                className={cn("h-10 px-6 rounded-full text-[11px] font-black uppercase tracking-widest transition-all", categoryId === cat.id ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'bg-white/5 border-white/10 text-muted-foreground hover:text-foreground')}
                                aria-label={`Filtrar por ${cat.name}`}
                            >
                                {cat.name}
                            </Button>
                        ))}
                    </div>

                    {error && (
                        <div className="text-center py-12 border-2 border-destructive/20 rounded-3xl bg-destructive/5" role="alert" aria-live="assertive" aria-label="Erro ao carregar artigos">
                            <p className="text-destructive font-medium">
                                Erro ao carregar artigos. Tente novamente mais tarde.
                            </p>
                        </div>
                    )}

                    {isFetching && list.length === 0 && (
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

                    {!error && mergedList.length > 0 && (
                        <div
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
                            role="list"
                            aria-label={`${mergedList.length} artigos encontrados`}
                        >
                            {mergedList.map((article: Article) => (
                                <PublicArticleCard key={article.id} article={article} showVisibilityBadge showStatusBadge useDashboardPreview />
                            ))}
                        </div>
                    )}

                    {!isFetching && !error && mergedList.length === 0 && (
                        <div className="text-center py-16 sm:py-20 border-2 border-dashed rounded-3xl bg-muted/10">
                            <div className="h-16 w-16 rounded-full bg-muted/30 mx-auto mb-4 flex items-center justify-center">
                                <BookOpen className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Nenhum artigo encontrado</h3>
                            <p className="text-muted-foreground max-w-md mx-auto">
                                {searchTerm
                                    ? `Não encontramos artigos com "${searchTerm}". Tente ajustar sua busca ou limpar o filtro.`
                                    : "Nenhum artigo disponível no momento."}
                            </p>
                        </div>
                    )}

                    {!error && (hasNextPage || hasNextPagePublic) && (
                        <div className="flex items-center justify-center mt-6">
                            <button
                                type="button"
                                className="h-10 px-6 rounded-full border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                                onClick={() => {
                                    if (hasNextPage) fetchNextPage()
                                    if (hasNextPagePublic) fetchNextPagePublic()
                                }}
                                disabled={isFetchingNextPage || isFetchingNextPagePublic}
                                aria-label="Carregar mais artigos"
                            >
                                {(isFetchingNextPage || isFetchingNextPagePublic) ? 'Carregando...' : 'Carregar mais'}
                            </button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="tags" className="mt-6">
                    {activeTab === 'tags' && <TagList />}
                </TabsContent>

                <TabsContent value="moderation" className="mt-6">
                    {activeTab === 'moderation' && <ArticleModeration />}
                </TabsContent>

                <TabsContent value="analytics" className="mt-6">
                    {activeTab === 'analytics' && <ArticleAnalytics />}
                </TabsContent>
            </Tabs>
        </div>
    )
}

export default function ArtigosPage() {
    return (
        <ModuleGuard moduleCode="articles">
            <Suspense fallback={null}>
                <ArtigosPageContent />
            </Suspense>
        </ModuleGuard>
    )
}
