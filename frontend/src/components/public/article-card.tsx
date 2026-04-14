"use client"

import Link from "next/link"
import { Article } from "@/types"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarDays, MessageSquare } from "lucide-react"
import Image from "next/image"
import { fixImageUrl } from "@/lib/utils"

interface PublicArticleCardProps {
    article: Article
    showVisibilityBadge?: boolean
    useDashboardPreview?: boolean
    showStatusBadge?: boolean
    priority?: boolean
}

export function PublicArticleCard({ article, showVisibilityBadge = false, useDashboardPreview = false, showStatusBadge = false, priority = false }: PublicArticleCardProps) {
    const imageUrl = (() => {
        const a = article as unknown as { cover_image?: string | null; image?: string | null }
        return a.cover_image || a.image || null
    })()

    const dateLabel = (() => {
        const raw = (article as unknown as { published_at?: string }).published_at || article.created_at
        if (!raw) return null
        const dt = new Date(raw)
        if (Number.isNaN(dt.getTime())) return null
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(dt)
    })()

    const href = (useDashboardPreview)
        ? `/artigos/preview/${article.slug}`
        : { pathname: `/p/artigos/${article.slug}`, query: { company_slug: article.company_slug } }

    return (
        <Link
            href={href}
            aria-label={`Ver artigo: ${article.title}`}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-2xl"
        >
            <Card className="h-full overflow-hidden hover:shadow-xl transition-all border border-primary/10 bg-background/95 backdrop-blur rounded-2xl relative">
                <div className="aspect-video relative overflow-hidden bg-muted rounded-t-2xl">
                    {imageUrl ? (
                        <Image
                            src={fixImageUrl(imageUrl) || ""}
                            alt={article.title || "Imagem do artigo"}
                            fill
                            className="object-cover hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            priority={priority}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground bg-muted/50">
                            Sem Imagem
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                </div>
                {showVisibilityBadge && article.is_public === false && (
                    <div className="absolute top-3 left-3 z-10">
                        <Badge variant="outline" className="bg-background/80 backdrop-blur text-[10px] font-bold">Privado</Badge>
                    </div>
                )}
                {showStatusBadge && article.status && (
                    <div className="absolute top-3 right-3 z-10">
                        <Badge
                            variant="secondary"
                            className={
                                `text-[10px] font-bold ${
                                  article.status === 'published' ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300' :
                                  article.status === 'scheduled' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300' :
                                  article.status === 'pending' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' :
                                  article.status === 'draft' ? 'bg-slate-500/20 text-slate-700 dark:text-slate-300' :
                                  'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                                }`
                            }
                        >
                            {article.status === 'published' ? 'Publicado' :
                             article.status === 'scheduled' ? 'Agendado' :
                             article.status === 'pending' ? 'Em Revisão' :
                             article.status === 'draft' ? 'Rascunho' : 'Rejeitado'}
                        </Badge>
                    </div>
                )}
                <CardHeader className="p-5 space-y-2">
                    {article.category_name && (
                        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-[10px]">
                            {article.category_name}
                        </Badge>
                    )}
                    <h3 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                        {article.title}
                    </h3>
                </CardHeader>
                <CardContent className="p-5 pt-0">
                    <p className="text-muted-foreground line-clamp-3 text-sm">
                        {article.excerpt || "Sem resumo disponível."}
                    </p>
                </CardContent>
                <CardFooter className="p-5 pt-0 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <CalendarDays className="h-3 w-3" aria-hidden="true" />
                            {dateLabel || ""}
                        </div>
                        <div className="flex items-center gap-1.5" title="Comentários">
                            <MessageSquare className="h-3 w-3" aria-hidden="true" />
                            {Number(article.comment_count ?? 0)}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-primary font-semibold">
                        Ler mais
                        <span>→</span>
                    </div>
                </CardFooter>
            </Card>
        </Link>
    )
}
