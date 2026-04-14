"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter, useSearchParams } from "next/navigation"
import { api } from "@/lib/axios"
import { Page } from "@/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useEffect, useState } from "react"

type PublicPage = Pick<Page, "title" | "slug" | "content" | "meta_title" | "meta_description" | "meta_keywords">

export default function PublicPageContent({ slug }: { slug: string }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const companySlugFromQuery = (searchParams.get("company_slug") || "").trim() || null
    const [resolvedCompanySlug, setResolvedCompanySlug] = useState<string | null>(null)

    const { data: companies } = useQuery({
        queryKey: ["public-companies"],
        queryFn: async ({ signal }) => {
            const res = await api.get<{ name: string; slug: string; logo?: string | null }[]>("/api/core/companies/public_list/", { signal })
            return Array.isArray(res.data) ? res.data : []
        },
        staleTime: 10 * 60 * 1000,
        retry: 1,
    })

    const { data: resolvedCompany, isFetching: isResolvingCompany } = useQuery({
        queryKey: ["public-page-company", slug, companies?.map((c) => c.slug).join(",") || ""],
        queryFn: async ({ signal }) => {
            const list = companies ?? []
            for (const c of list) {
                try {
                    const res = await api.get<PublicPage[]>(
                        `/api/pages/public/pages/?slug=${encodeURIComponent(slug)}&company_slug=${encodeURIComponent(c.slug)}`,
                        { headers: { "X-Company-Slug": c.slug }, signal }
                    )
                    if (Array.isArray(res.data) && res.data[0]) return c.slug
                } catch {
                }
            }
            return null
        },
        enabled: !!slug && !companySlugFromQuery && Array.isArray(companies) && companies.length > 0,
        retry: false,
    })

    useEffect(() => {
        if (!resolvedCompany) return
        setResolvedCompanySlug(resolvedCompany)
        router.replace(`/p/${slug}?company_slug=${encodeURIComponent(resolvedCompany)}`)
    }, [resolvedCompany, router, slug])

    const effectiveCompanySlug = companySlugFromQuery || resolvedCompanySlug

    const { data: page, isLoading } = useQuery({
        queryKey: ['public-page', slug, effectiveCompanySlug],
        queryFn: async ({ signal }) => {
            const qs = `&company_slug=${encodeURIComponent(effectiveCompanySlug as string)}`
            const res = await api.get<PublicPage[]>(`/api/pages/public/pages/?slug=${slug}${qs}`, {
                headers: { 'X-Company-Slug': effectiveCompanySlug as string },
                signal,
            })
            return res.data[0] || null
        },
        enabled: !!slug && !!effectiveCompanySlug
    })

    if (isLoading || isResolvingCompany) {
        return (
            <div className="max-w-4xl mx-auto space-y-8 py-12" role="status" aria-live="polite" aria-label="Carregando conteúdo da página">
                <Skeleton className="h-12 w-2/3" />
                <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </div>
            </div>
        )
    }

    if (!effectiveCompanySlug) {
        return (
            <div className="text-center py-24" role="alert" aria-live="assertive">
                <h2 className="text-3xl font-bold mb-4">Selecione uma empresa</h2>
                <p className="text-muted-foreground mb-8">
                    Selecione uma empresa para visualizar o conteúdo público.
                </p>
                <div className="flex flex-col items-center gap-3">
                    {(companies ?? []).map((c) => (
                        <Button
                            key={c.slug}
                            type="button"
                            variant="outline"
                            className="rounded-xl h-12 px-6 w-full max-w-sm justify-center"
                            onClick={() => router.replace(`/p/${slug}?company_slug=${encodeURIComponent(c.slug)}`)}
                        >
                            {c.name}
                        </Button>
                    ))}
                    <Button
                        type="button"
                        onClick={() => router.push('/login')}
                        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl h-12 px-6 w-full max-w-sm"
                        aria-label="Ir para login"
                    >
                        Ir para login
                    </Button>
                </div>
            </div>
        )
    }

    if (!page) {
        return (
            <div className="text-center py-24" role="alert" aria-live="assertive">
                <h2 className="text-3xl font-bold mb-4">Página não encontrada</h2>
                <p className="text-muted-foreground mb-8">O conteúdo que você procura pode ter sido removido ou o link está incorreto.</p>
                <Button onClick={() => router.push('/p/artigos')} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Ver outros conteúdos">
                    Ver outros conteúdos
                </Button>
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto py-12" role="main" aria-label="Conteúdo da página pública">
            <header className="mb-12">
                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
                    {page.title}
                </h1>
                <div className="h-1.5 w-20 bg-primary rounded-full" />
            </header>

            <div
                className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary hover:prose-a:underline"
                dangerouslySetInnerHTML={{ __html: page.content }}
            />
        </div>
    )
}
