import { Metadata } from 'next'
import { PublicArticleViewer } from "@/components/public/public-article-viewer"

interface Props {
    params: Promise<{ slug: string }>
    searchParams?: Promise<{ company_slug?: string }>
}

async function getArticle(slug: string, companySlug?: string) {
    try {
        // Using public API endpoint that doesn't require authentication
        const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';

        // Ensure slug is clean
        const cleanSlug = encodeURIComponent(slug)

        // Optional tenant hint header for multi-tenant isolation
        // No server-side, não temos acesso direto ao localStorage ou window
        // Devemos confiar na variável de ambiente ou parâmetro de busca se disponível
        const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG
        const effectiveCompany = companySlug || envCompany

        // Se effectiveCompany não estiver definido, NÃO enviar o header
        // A API pública deve lidar com isso (retornar 404 ou buscar globalmente se permitido)
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }
        
        if (effectiveCompany) {
            headers['X-Company-Slug'] = effectiveCompany
        }

        const qs = effectiveCompany ? `?company_slug=${encodeURIComponent(effectiveCompany)}` : ''
        const res = await fetch(`${apiUrl}/api/articles/public/articles/${cleanSlug}/${qs}`, {
            next: { revalidate: 300 }, // Cache for 5 minutes
            headers
        })

        if (!res.ok) {
            // Se falhar com contexto, tenta sem contexto (caso seja um artigo global/compartilhado)
            if (res.status === 404 && effectiveCompany) {
                const retry = await fetch(`${apiUrl}/api/articles/public/articles/${cleanSlug}/`, {
                    next: { revalidate: 300 },
                    headers: { 'Content-Type': 'application/json' }
                })
                if (!retry.ok) {
                    return null
                }
                const retryData = await retry.json()
                return retryData || null
            }
            return null
        }

        const data = await res.json()
        return data || null
    } catch {
        return null
    }
}

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const { slug } = await params
    const article = await getArticle(slug)

    if (!article) return { title: 'Artigo não encontrado | Atlas' }

    // Fetch company branding for icons
    let icon = '/favicon.ico'
    try {
        const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8005';
        const brandingRes = await fetch(`${apiUrl}/api/core/branding/public_current/`, {
            headers: { 'X-Company-Slug': article.company_slug || '' },
            next: { revalidate: 3600 }
        })
        if (brandingRes.ok) {
            const branding = await brandingRes.json()
            if (branding.icon_url) icon = branding.icon_url
        }
    } catch {
    }

    const imageUrl = article.cover_image || article.image

    return {
        title: `${article.meta_title || article.title} | ${article.company_name || 'Atlas'}`,
        description: article.meta_description || article.excerpt,
        icons: {
            icon: icon,
            shortcut: icon,
            apple: icon,
        },
        openGraph: {
            title: article.meta_title || article.title,
            description: article.meta_description || article.excerpt,
            images: imageUrl ? [{ url: imageUrl }] : [],
            type: 'article',
            publishedTime: article.created_at,
            siteName: article.company_name || 'Atlas',
        },
        twitter: {
            card: 'summary_large_image',
            title: article.meta_title || article.title,
            description: article.meta_description || article.excerpt,
            images: imageUrl ? [imageUrl] : [],
        }
    }
}

export default async function PublicArticleDetailPage({ params, searchParams }: Props) {
    const { slug } = await params
    const sp = searchParams ? await searchParams : undefined
    const article = await getArticle(slug, sp?.company_slug)

    // Se não encontrou artigo público, não retornamos 404 imediatamente
    // Passamos null para o componente cliente tentar buscar com autenticação
    
    // JSON-LD só é gerado se tivermos o artigo no servidor (SEO)
    const jsonLd = article ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: article.meta_description || article.excerpt,
        image: article.cover_image || article.image ? [article.cover_image || article.image] : [],
        datePublished: article.published_at || article.created_at,
        dateModified: article.updated_at,
        author: [{
            '@type': 'Person',
            name: article.author_name || 'Equipe Atlas',
        }],
        publisher: {
            '@type': 'Organization',
            name: article.company_name || 'Atlas SaaS',
            logo: {
                '@type': 'ImageObject',
                url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/favicon.ico`,
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/p/artigos/${slug}`,
        },
    } : null

    return (
        <>
            {jsonLd && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            )}
            <PublicArticleViewer initialArticle={article} slug={slug} />
        </>
    )
}
