"use client"

import { useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, CalendarDays, User, Pencil } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import Image from "next/image"
import { fixImageUrl } from "@/lib/utils"
import { AboutAuthor } from "@/components/articles/about-author"
import { PublicArticleComments } from "@/components/articles/public-article-comments"
import type { AuthorInfo } from "@/components/articles/about-author"
import { useAuth } from "@/hooks/use-auth"

type ArticlePreview = {
  id: number
  title: string
  slug: string
  content?: string
  excerpt?: string | null
  cover_image?: string | null
  image?: string | null
  category_name?: string | null
  created_at: string
  author_name?: string | null
  is_public?: boolean
  author_info?: AuthorInfo | null
  company_slug?: string | null
}

export default function ArticlePreviewPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params?.slug

  const { data, isLoading } = useQuery<ArticlePreview | null>({
    queryKey: ["dashboard-article-preview", slug],
    queryFn: async () => {
      const res = await api.get(`/api/articles/articles/`, { params: { slug } })
      const payload = res.data?.results ?? res.data
      return Array.isArray(payload) ? (payload[0] ?? null) : (payload ?? null)
    },
    enabled: Boolean(slug),
  })
  const { user: me } = useAuth()

  const imageUrl = useMemo(() => fixImageUrl(data?.cover_image || data?.image || null), [data])

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]">Carregando...</div>
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <div className="text-2xl font-bold mb-3">Artigo não encontrado</div>
        <p className="text-muted-foreground mb-6">Verifique se o artigo existe e se você tem acesso.</p>
        <Button onClick={() => router.push("/artigos")} variant="default">
          Voltar
        </Button>
      </div>
    )
  }

  return (
    <article className="max-w-4xl mx-auto py-10" role="article" aria-labelledby="article-title">
      <Button
        variant="ghost"
        size="sm"
        className="mb-8 p-0 hover:bg-transparent text-muted-foreground hover:text-primary transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
        onClick={() => router.back()}
      >
        <span className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" aria-hidden="true" />
          Voltar
        </span>
      </Button>

      <header className="space-y-8 mb-12">
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {data.category_name && (
            <div className="px-3 py-1 rounded-full bg-primary/10 text-primary font-bold text-[10px] uppercase tracking-wider">
              {data.category_name}
            </div>
          )}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 opacity-70" aria-hidden="true" />
            <span>{format(new Date(data.created_at), "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
          </div>
          {data.author_name && (
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <User className="h-3 w-3" aria-hidden="true" />
              </div>
              <span className="font-medium text-foreground">{data.author_name}</span>
            </div>
          )}
          {data.is_public === false && (
            <Badge variant="outline" className="bg-muted/30">Privado</Badge>
          )}
        </div>

        <h1 id="article-title" className="text-4xl md:text-6xl font-black tracking-tighter leading-[1.1] text-foreground">
          {data.title}
        </h1>
        {me && (me.is_staff || me.is_superuser) && (
          <div>
            <Button
              variant="default"
              className="rounded-full gap-2"
              onClick={() => router.push(`/artigos/editar/${encodeURIComponent(data.slug)}`)}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </Button>
          </div>
        )}

        {data.excerpt && (
          <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed font-medium italic border-l-4 pl-8 border-primary/30">
            {data.excerpt}
          </p>
        )}
      </header>

      {imageUrl && (
        <div className="aspect-[21/9] relative rounded-[32px] overflow-hidden mb-16 shadow-2xl shadow-primary/5 border border-primary/5">
          <Image
            src={imageUrl}
            alt={data.title || "Imagem"}
            fill
            className="object-cover hover:scale-105 transition-transform duration-700"
            sizes="(max-width: 768px) 100vw, 75vw"
          />
        </div>
      )}

      <div
        className="prose prose-lg md:prose-xl dark:prose-invert max-w-none 
        prose-headings:font-black prose-headings:tracking-tight
        prose-a:text-primary prose-a:font-bold hover:prose-a:underline
        prose-img:rounded-3xl prose-blockquote:border-primary prose-blockquote:bg-primary/5 prose-blockquote:p-6 prose-blockquote:rounded-2xl"
        dangerouslySetInnerHTML={{ __html: data.content || "" }}
      />

      <AboutAuthor author={(data as ArticlePreview).author_info} companySlug={(data as ArticlePreview).company_slug} />
      <PublicArticleComments
        articleId={data.id}
        articleSlug={data.slug}
        companySlug={(data as ArticlePreview).company_slug}
      />
    </article>
  )
}
