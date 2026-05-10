import { Metadata } from "next"
import { Suspense } from "react"
import { ArticlesListClient } from "./articles-list-client"
import { Article } from "@/types"

export const metadata: Metadata = {
  title: "Artigos e Novidades | Atlas",
  description: "Fique por dentro das últimas novidades, tutoriais e conteúdos exclusivos.",
}

// Revalidate every 60 seconds so the initial SSR result stays fresh
export const revalidate = 60

interface PageProps {
  searchParams?: Promise<{ company_slug?: string; search?: string }>
}

async function fetchInitialArticles(companySlug?: string): Promise<{ articles: Article[]; hasNext: boolean }> {
  try {
    const apiUrl = process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005"
    const params = new URLSearchParams({ page_size: "30" })
    if (companySlug) params.set("company_slug", companySlug)

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (companySlug) headers["X-Company-Slug"] = companySlug

    const res = await fetch(`${apiUrl}/api/articles/public/articles/?${params}`, {
      headers,
      next: { revalidate: 60 },
    })

    if (!res.ok) return { articles: [], hasNext: false }

    const data = await res.json()
    const articles: Article[] = Array.isArray(data) ? data : (data?.results ?? [])
    return { articles, hasNext: Boolean(data?.next) }
  } catch {
    return { articles: [], hasNext: false }
  }
}

export default async function PublicArtigosPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const companySlug = sp?.company_slug

  // Pre-fetch only when there's no active search (search is always client-side)
  const { articles, hasNext } = sp?.search
    ? { articles: [], hasNext: false }
    : await fetchInitialArticles(companySlug)

  return (
    <Suspense>
      <ArticlesListClient initialArticles={articles} initialHasNext={hasNext} />
    </Suspense>
  )
}
