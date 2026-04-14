"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/axios"
import { Loader2, ArrowLeft, CalendarDays, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Link from "next/link"
import Image from "next/image"
import { fixImageUrl } from "@/lib/utils"
import { AboutAuthor } from "@/components/articles/about-author"
import { PublicArticleComments } from "@/components/articles/public-article-comments"
import { useRouter, useSearchParams } from "next/navigation"

interface Article {
    id: number
    title: string
    content: string
    excerpt?: string
    image?: string | null
    cover_image?: string | null
    category_name?: string | null
    tags?: string[] | { name: string }[]
    author_name?: string | null
    author_info?: {
        id: number
        username: string
        full_name: string
        avatar_url?: string | null
        bio?: string | null
    } | null
    created_at: string
    published_at?: string
    updated_at?: string
    company_slug?: string | null
    comment_count?: number
}

interface Props {
    initialArticle: Article | null
    slug: string
}

export function PublicArticleViewer({ initialArticle, slug }: Props) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [article, setArticle] = useState<Article | null>(initialArticle)
    const [loading, setLoading] = useState(!initialArticle)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (article) {
            setLoading(false)
            return
        }

        let cancelled = false

        const run = async () => {
            const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null
            const qsCompany = (searchParams.get("company_slug") || "").trim() || null

            const tryFetchPublic = async (companySlug: string) => {
                const res = await api.get(`/api/articles/public/articles/${encodeURIComponent(slug)}/`, {
                    params: { company_slug: companySlug },
                    headers: { "X-Company-Slug": companySlug },
                })
                if (cancelled) return
                setArticle(res.data as Article)
                router.replace(`/p/artigos/${slug}?company_slug=${encodeURIComponent(companySlug)}`)
            }

            try {
                if (token) {
                    const res = await api.get(`/api/articles/articles/`, { params: { slug } })
                    const results = res.data.results || res.data
                    if (Array.isArray(results) && results[0]) {
                        if (!cancelled) setArticle(results[0])
                        return
                    }
                    if (!cancelled) setError(true)
                    return
                }

                if (qsCompany) {
                    await tryFetchPublic(qsCompany)
                    return
                }

                const listRes = await api.get<{ slug: string }[]>("/api/core/companies/public_list/")
                const companies = Array.isArray(listRes.data) ? listRes.data : []
                if (companies.length === 1 && companies[0]?.slug) {
                    await tryFetchPublic(companies[0].slug)
                    return
                }
                for (const c of companies) {
                    if (!c?.slug) continue
                    try {
                        await tryFetchPublic(c.slug)
                        return
                    } catch {
                    }
                }
                if (!cancelled) setError(true)
            } catch {
                if (!cancelled) setError(true)
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        run()
        return () => {
            cancelled = true
        }
    }, [article, router, searchParams, slug])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="animate-spin h-8 w-8 text-primary" />
                <p className="text-muted-foreground">Verificando permissões de acesso...</p>
            </div>
        )
    }

    if (error || !article) {
        return (
            <div className="text-center py-20 px-4">
                <h1 className="text-2xl font-bold mb-4">Artigo não encontrado</h1>
                <p className="text-muted-foreground mb-8">Este conteúdo pode não existir ou ser privado.</p>
                <Button asChild>
                    <Link href="/p/artigos">Voltar para lista pública</Link>
                </Button>
            </div>
        )
    }

    const imageUrl = fixImageUrl(article.cover_image || article.image)
    const commentCount = Number(article.comment_count ?? 0)
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        datePublished: article.published_at || article.created_at,
        dateModified: article.updated_at || article.published_at || article.created_at,
        author: article.author_name ? { "@type": "Person", name: article.author_name } : undefined,
        commentCount,
        mainEntityOfPage: { "@type": "WebPage", "@id": `/p/artigos/${slug}` },
    }

    return (
        <article className="max-w-4xl mx-auto py-10 px-4 sm:px-6" role="article" aria-labelledby="article-title">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <Button
                variant="ghost"
                size="sm"
                asChild
                className="mb-8 p-0 hover:bg-transparent text-muted-foreground hover:text-primary transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            >
                <Link href="/p/artigos" className="flex items-center gap-2" aria-label="Voltar para lista de artigos">
                    <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
                    Voltar para artigos
                </Link>
            </Button>

            <header className="space-y-8 mb-12">
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {article.category_name && (
                        <div className="px-3 py-1 rounded-full bg-primary/10 text-primary font-bold text-[10px] uppercase tracking-wider">
                            {article.category_name}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 opacity-70" aria-hidden="true" />
                        <span>{format(new Date(article.published_at || article.created_at), "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
                    </div>
                    {article.author_name && (
                        <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-3 w-3" aria-hidden="true" />
                            </div>
                            <span className="font-medium text-foreground">{article.author_name}</span>
                        </div>
                    )}
                </div>

                <h1 id="article-title" className="text-4xl md:text-6xl font-black tracking-tighter leading-[1.1] text-foreground">
                    {article.title}
                </h1>

                {article.excerpt && (
                    <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-medium italic border-l-4 pl-8 border-primary/30">
                        {article.excerpt}
                    </p>
                )}
            </header>

            {imageUrl && (
                <div className="aspect-[21/9] relative rounded-[32px] overflow-hidden mb-16 shadow-2xl shadow-primary/5 border border-primary/5">
                    <Image
                        src={imageUrl}
                        alt={article.title || 'Imagem'}
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-700"
                        sizes="(max-width: 768px) 100vw, 75vw"
                        priority
                    />
                </div>
            )}

            <div
                className="prose prose-lg md:prose-xl dark:prose-invert max-w-none 
                prose-headings:font-black prose-headings:tracking-tight
                prose-a:text-primary prose-a:font-bold hover:prose-a:underline
                prose-img:rounded-3xl prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:p-6 prose-blockquote:rounded-2xl"
                dangerouslySetInnerHTML={{ __html: article.content }}
            />

            <footer className="mt-20 pt-10 border-t border-border/50">
                <ul className="flex flex-wrap gap-2" role="list" aria-label="Tags do artigo">
                    {Array.isArray(article.tags) && article.tags.map((tag: string | { name?: string }, idx: number) => {
                        const label = typeof tag === 'string' ? tag : tag?.name
                        return (
                            <li key={idx} role="listitem">
                                <Badge variant="outline" className="rounded-full px-4 py-1.5 bg-muted/30 hover:bg-primary/10 hover:text-primary transition-colors cursor-default border-none">
                                    #{label}
                                </Badge>
                            </li>
                        )
                    })}
                </ul>
            </footer>

            <AboutAuthor author={article.author_info} companySlug={article.company_slug} />
            <PublicArticleComments articleId={article.id} articleSlug={slug} companySlug={article.company_slug} />
        </article>
    )
}
