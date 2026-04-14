import { api } from "@/lib/axios"
import { Page } from "@/types"
// Removed unused imports
import { Metadata } from 'next'
import PublicPageContent from "./content"

type PublicPage = Pick<Page, "title" | "slug" | "content" | "meta_title" | "meta_description" | "meta_keywords">

export async function generateMetadata(
    { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
    const { slug } = await params

    try {
        const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG || ''
        const qs = envCompany ? `&company_slug=${encodeURIComponent(envCompany)}` : ''
        const res = await api.get<PublicPage[]>(`/api/pages/public/pages/?slug=${slug}${qs}`, {
            headers: envCompany ? { 'X-Company-Slug': envCompany } : {}
        })
        const page = res.data[0]

        if (!page) return { title: 'Página não encontrada' }

        return {
            title: page.meta_title || page.title,
            description: page.meta_description,
            openGraph: {
                title: page.meta_title || page.title,
                description: page.meta_description,
            },
        }
    } catch {
        return { title: 'Atlas Page' }
    }
}

export default async function PublicPageDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <PublicPageContent slug={slug} />
}
