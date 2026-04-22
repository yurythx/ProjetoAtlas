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
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-3xl"
        >
            <Card className="h-full overflow-hidden hover:shadow-2xl hover:shadow-primary/5 transition-all duration-500 border border-white/10 bg-background/20 backdrop-blur-xl rounded-[2rem] relative group/card">
                <div className="aspect-video relative overflow-hidden bg-muted rounded-t-[2rem]">
                    {imageUrl ? (
                        <Image
                            src={fixImageUrl(imageUrl) || ""}
                            alt={article.title || "Imagem do artigo"}
                            fill
                            className="object-cover group-hover/card:scale-105 transition-transform duration-700"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            priority={priority}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground/30 bg-muted/20">
                            <BookOpen className="h-10 w-10 opacity-20" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />
                </div>
                {showVisibilityBadge && article.is_public === false && (
                    <div className="absolute top-4 left-4 z-10">
                        <Badge variant="outline" className="bg-background/40 backdrop-blur-md border-white/10 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">Privado</Badge>
                    </div>
                )}
                {showStatusBadge && article.status && (
                    <div className="absolute top-4 right-4 z-10">
                        <Badge
                            variant="secondary"
                            className={
                                `text-[10px] font-black uppercase tracking-widest px-3 py-1 shadow-lg ${
                                  article.status === 'published' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' :
                                  article.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' :
                                  article.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border-amber-500/20' :
                                  article.status === 'draft' ? 'bg-slate-500/20 text-slate-400 border-slate-500/20' :
                                  'bg-rose-500/20 text-rose-400 border-rose-500/20'
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
                <CardHeader className="p-6 space-y-3">
                    {article.category_name && (
                        <Badge variant="secondary" className="w-fit rounded-full px-4 py-1 text-[10px] font-bold bg-primary/5 text-primary border-primary/10">
                            {article.category_name}
                        </Badge>
                    )}
                    <h3 className="text-2xl font-black tracking-tighter leading-[1.1] group-hover/card:text-primary transition-colors line-clamp-2">
                        {article.title}
                    </h3>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed font-medium">
                        {article.excerpt || "Sem resumo disponível."}
                    </p>
                </CardContent>
                <CardFooter className="p-6 pt-0 flex items-center justify-between text-[11px] font-bold text-muted-foreground border-t border-white/5 mt-auto">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 opacity-70">
                            <CalendarDays className="h-3 w-3" aria-hidden="true" />
                            {dateLabel || ""}
                        </div>
                        <div className="flex items-center gap-1.5 opacity-70" title="Comentários">
                            <MessageSquare className="h-3 w-3" aria-hidden="true" />
                            {Number(article.comment_count ?? 0)}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px] group/btn">
                        Acessar
                        <span className="group-hover/btn:translate-x-1 transition-transform">→</span>
                    </div>
                </CardFooter>
            </Card>
        </Link>
    )
}
