"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { SlideUp, FadeIn } from "@/components/ui/motion"
import { H2, P } from "@/components/ui/typography"
import { Activity, TrendingUp, Users, Eye, Sparkles, Lock, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

type ModerationMetrics = {
    pending_comments: number
    pending_replies: number
    pending_total: number
    top_articles: Array<{ article_id: number; article__title: string; article__slug: string; count: number }>
    oldest_pending?: { created_at?: string; article__title?: string; article__slug?: string } | null
}

interface InsightsDashboardProps {
    isPremium: boolean
    moderationMetrics?: ModerationMetrics | null
}

export function InsightsDashboard({ isPremium, moderationMetrics }: InsightsDashboardProps) {
    if (!isPremium) {
        return (
            <Card className="border-dashed border-2 bg-muted/30 h-[500px] flex flex-col items-center justify-center text-center p-12">
                <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                    <Lock className="h-10 w-10 text-primary" aria-hidden="true" />
                </div>
                <H2 className="border-none mb-2">Insights Avançados</H2>
                <P className="text-muted-foreground max-w-md mb-8">
                    Desbloqueie métricas profundas de engajamento, origem de audiência e performance de conteúdo com IA.
                </P>
                <Button size="lg" className="rounded-full shadow-lg shadow-primary/20 gap-2">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Fazer Upgrade para Premium
                </Button>
            </Card>
        )
    }

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SlideUp delay={0.1}>
                    <Card className="bg-gradient-to-br from-indigo-500/10 to-transparent border-indigo-500/20">
                        <CardHeader className="pb-2">
                            <CardDescription className="uppercase text-[10px] font-bold tracking-widest text-indigo-600">Taxa de Engajamento</CardDescription>
                            <CardTitle className="text-3xl font-black">24.8%</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
                                <TrendingUp className="h-3 w-3" aria-hidden="true" /> +5.2% vs semana passada
                            </div>
                        </CardContent>
                    </Card>
                </SlideUp>

                <SlideUp delay={0.2}>
                    <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
                        <CardHeader className="pb-2">
                            <CardDescription className="uppercase text-[10px] font-bold tracking-widest text-emerald-600">Tempo Médio de Leitura</CardDescription>
                            <CardTitle className="text-3xl font-black">4m 12s</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
                                <TrendingUp className="h-3 w-3" aria-hidden="true" /> +12s vs semana passada
                            </div>
                        </CardContent>
                    </Card>
                </SlideUp>

                <SlideUp delay={0.3}>
                    <Card className="bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/20">
                        <CardHeader className="pb-2">
                            <CardDescription className="uppercase text-[10px] font-bold tracking-widest text-amber-600">Conversão de CTAs</CardDescription>
                            <CardTitle className="text-3xl font-black">8.4%</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
                                <TrendingUp className="h-3 w-3" aria-hidden="true" /> +1.1% vs semana passada
                            </div>
                        </CardContent>
                    </Card>
                </SlideUp>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <FadeIn delay={0.35}>
                    <Card className="overflow-hidden border-primary/10">
                        <CardHeader className="bg-muted/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Moderação</CardTitle>
                                    <CardDescription>Comentários e respostas pendentes</CardDescription>
                                </div>
                                <MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            {!moderationMetrics ? (
                                <div className="text-sm text-muted-foreground">
                                    Métricas indisponíveis para este usuário.
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-end justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                Pendentes (total)
                                            </div>
                                            <div className="text-3xl font-black">{moderationMetrics.pending_total}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                                {moderationMetrics.pending_comments} comentários
                                            </Badge>
                                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                                {moderationMetrics.pending_replies} respostas
                                            </Badge>
                                        </div>
                                    </div>
                                    {moderationMetrics.oldest_pending?.created_at && (
                                        <div className="text-xs text-muted-foreground">
                                            Mais antigo:{" "}
                                            {new Date(moderationMetrics.oldest_pending.created_at).toLocaleString("pt-BR")}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </FadeIn>

                <FadeIn delay={0.45}>
                    <Card className="overflow-hidden border-primary/10">
                        <CardHeader className="bg-muted/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Artigos com mais pendências</CardTitle>
                                    <CardDescription>Top 5 por volume</CardDescription>
                                </div>
                                <Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y">
                                {(moderationMetrics?.top_articles ?? []).length === 0 ? (
                                    <div className="p-4 text-sm text-muted-foreground">Sem dados.</div>
                                ) : (
                                    (moderationMetrics?.top_articles ?? []).map((it) => (
                                        <div key={it.article_id} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                                            <div className="text-sm font-medium truncate max-w-[280px]">{it.article__title}</div>
                                            <Badge variant="secondary" className="text-[10px] rounded-xl">
                                                {it.count}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </FadeIn>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <FadeIn delay={0.4}>
                    <Card className="overflow-hidden border-primary/10">
                        <CardHeader className="bg-muted/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Origem do Tráfego</CardTitle>
                                    <CardDescription>De onde vêm seus leitores</CardDescription>
                                </div>
                                <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="space-y-4">
                                {[
                                    { label: "Direto", value: 45, color: "bg-primary" },
                                    { label: "Google / SEO", value: 30, color: "bg-indigo-500" },
                                    { label: "Redes Sociais", value: 15, color: "bg-emerald-500" },
                                    { label: "Outros", value: 10, color: "bg-slate-400" },
                                ].map((item, i) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex justify-between text-xs font-bold">
                                            <span>{item.label}</span>
                                            <span>{item.value}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                            <div className={`${item.color} h-full rounded-full`} style={{ width: `${item.value}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </FadeIn>

                <FadeIn delay={0.5}>
                    <Card className="overflow-hidden border-primary/10">
                        <CardHeader className="bg-muted/30">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Performance de Artigos</CardTitle>
                                    <CardDescription>Top 5 mais engajados</CardDescription>
                                </div>
                                <Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y">
                                {[
                                    { title: "Como escalar seu SaaS", views: "1.2k", eng: "45%" },
                                    { title: "Guia definitivo de Python", views: "980", eng: "38%" },
                                    { title: "Novidades do React 19", views: "850", eng: "34%" },
                                    { title: "Clean Code na prática", views: "720", eng: "31%" },
                                    { title: "Docker para iniciantes", views: "610", eng: "28%" },
                                ].map((art, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 hover:bg-muted/20 transition-colors">
                                        <div className="text-sm font-medium truncate max-w-[200px]">{art.title}</div>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <Eye className="h-3 w-3" aria-hidden="true" /> {art.views}
                                            </div>
                                            <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                                                {art.eng} Eng.
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </FadeIn>
            </div>
        </div>
    )
}
