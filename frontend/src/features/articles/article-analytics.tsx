"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, TrendingUp, Eye, FileText, Calendar } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export function ArticleAnalytics() {
    const { data, isLoading } = useQuery({
        queryKey: ['article-analytics'],
        queryFn: async () => {
            try {
                const res = await api.get('/api/articles/articles/analytics/')
                return res.data ?? {}
            } catch {
                return {}
            }
        }
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20" role="status" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            </div>
        )
    }

    const safe = (data ?? {}) as {
        total_articles?: unknown
        total_views?: unknown
        most_viewed?: unknown
        views_by_date?: unknown
    }
    const total_articles = Number.isFinite(Number(safe.total_articles)) ? Number(safe.total_articles) : 0
    const total_views = Number.isFinite(Number(safe.total_views)) ? Number(safe.total_views) : 0
    const most_viewed = Array.isArray(safe.most_viewed) ? safe.most_viewed as Array<{ id: number; title: string; slug: string; total_views: number; views_last_30_days: number }> : []
    const views_by_date = Array.isArray(safe.views_by_date) ? safe.views_by_date as Array<{ date: string; count: number }> : []

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-[2rem] shadow-xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <FileText className="h-24 w-24 text-primary" />
                    </div>
                    <CardContent className="pt-8 relative z-10">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Total de Artigos</p>
                                <h3 className="text-4xl font-black tracking-tighter text-foreground">{total_articles}</h3>
                            </div>
                            <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/5">
                                <FileText className="h-7 w-7" aria-hidden="true" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-[2rem] shadow-xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <Eye className="h-24 w-24 text-blue-500" />
                    </div>
                    <CardContent className="pt-8 relative z-10">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Visualizações Totais</p>
                                <h3 className="text-4xl font-black tracking-tighter text-foreground">{total_views.toLocaleString()}</h3>
                            </div>
                            <div className="h-14 w-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 shadow-lg shadow-blue-500/5">
                                <Eye className="h-7 w-7" aria-hidden="true" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-[2rem] shadow-xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <TrendingUp className="h-24 w-24 text-emerald-500" />
                    </div>
                    <CardContent className="pt-8 relative z-10">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Engajamento / Artigo</p>
                                <h3 className="text-4xl font-black tracking-tighter text-foreground">
                                    {total_articles > 0 ? (total_views / total_articles).toFixed(1) : 0}
                                </h3>
                            </div>
                            <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-lg shadow-emerald-500/5">
                                <TrendingUp className="h-7 w-7" aria-hidden="true" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                        <CardTitle className="flex items-center gap-3 text-2xl font-black tracking-tighter">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Calendar className="h-5 w-5 text-primary" aria-hidden="true" />
                            </div>
                            Fluxo de Audiência
                        </CardTitle>
                        <CardDescription className="font-medium">Visualizações agregadas nos últimos 15 dias</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-0">
                        <div className="h-[320px] w-full mt-6">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={views_by_date}>
                                    <defs>
                                        <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(date) => {
                                            try {
                                                return format(new Date(date), 'dd/MM')
                                            } catch {
                                                return String(date)
                                            }
                                        }}
                                        stroke="rgba(255,255,255,0.3)"
                                        fontSize={10}
                                        fontWeight="bold"
                                        tickLine={false}
                                        axisLine={false}
                                        dy={10}
                                    />
                                    <YAxis
                                        stroke="rgba(255,255,255,0.3)"
                                        fontSize={10}
                                        fontWeight="bold"
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value}`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(15,15,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', backdropFilter: 'blur(10px)', color: '#fff', fontSize: '12px' }}
                                        labelFormatter={(label) => format(new Date(label), 'dd MMMM yyyy', { locale: ptBR })}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        name="Visualizações"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorViews)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/5 backdrop-blur-xl border-white/10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                    <CardHeader className="p-8 pb-4">
                        <CardTitle className="flex items-center gap-3 text-2xl font-black tracking-tighter">
                            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <TrendingUp className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                            </div>
                            Top Performance
                        </CardTitle>
                        <CardDescription className="font-medium">Artigos com maior engajamento recente</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 pt-0">
                        <div className="space-y-8 mt-6">
                            {most_viewed.map((article: { id: number; title: string; slug: string; total_views: number; views_last_30_days: number }, index: number) => (
                                <div key={article.id || `article-${index}`} className="flex items-center justify-between group/item">
                                    <div className="flex items-center gap-5">
                                        <div className="h-10 w-10 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center text-xs font-black group-hover/item:bg-primary group-hover/item:text-primary-foreground transition-all duration-300">
                                            {index + 1}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm line-clamp-1 group-hover/item:text-primary transition-colors">{article.title}</p>
                                            <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest mt-1 opacity-50">{article.slug}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        <div className="text-right">
                                            <p className="text-sm font-black tracking-tighter">{article.total_views}</p>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Total</p>
                                        </div>
                                        <div className="text-right px-4 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/10">
                                            <p className="text-sm font-black tracking-tighter text-emerald-500">+{article.views_last_30_days}</p>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/70">30 Dias</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
