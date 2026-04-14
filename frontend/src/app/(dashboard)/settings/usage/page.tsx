"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, FileText, HardDrive, AlertTriangle } from "lucide-react"
import { Protected } from "@/components/auth/protected"

interface UsageMetric {
    current: number
    limit: number
    label: string
}

interface UsageData {
    plan: string
    usage: {
        users: UsageMetric
        articles: UsageMetric
        storage_mb: UsageMetric
    }
}

function UsageCard({ title, icon: Icon, metric }: { title: string, icon: React.ComponentType<{ className?: string }>, metric: UsageMetric }) {
    if (!metric) return null

    const percentage = metric.limit === -1 ? 0 : Math.min((metric.current / metric.limit) * 100, 100)
    const isUnlimited = metric.limit === -1

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{metric.current}</div>
                <div className="text-xs text-muted-foreground mb-4">
                    {isUnlimited ? "Ilimitado" : `de ${metric.limit} permitidos`}
                </div>
                {!isUnlimited && (
                    <div className="space-y-1">
                        <Progress value={percentage} className={percentage > 90 ? "bg-red-200" : ""} aria-label={`Uso de ${title.toLowerCase()}`} />
                        <p className="text-[10px] text-right text-muted-foreground">{percentage.toFixed(0)}% usado</p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function UsagePage() {
    const { data, isLoading, error } = useQuery({
        queryKey: ['usage-metrics'],
        queryFn: async () => {
            const res = await api.get<UsageData>('/api/licensing/my-license/')
            return res.data
        },
        retry: false
    })

    if (isLoading) {
        return <div className="p-8 text-center" role="status" aria-live="polite" aria-label="Carregando métricas de uso">Carregando métricas de uso...</div>
    }

    if (error || !data) {
        // Show empty state / onboarding if no license
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                <div className="p-4 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30">
                    <AlertTriangle className="h-8 w-8" aria-hidden="true" />
                </div>
                <h2 className="text-xl font-semibold">Nenhuma licença ativa encontrada</h2>
                <p className="text-muted-foreground max-w-md">
                    Parece que sua conta ainda não possui um plano ativo. Entre em contato com o suporte ou escolha um plano.
                </p>
            </div>
        )
    }

    return (
        <Protected requireStaff>
        <div className="space-y-8 max-w-5xl mx-auto p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Métricas de Uso</h1>
                    <p className="text-muted-foreground mt-2">
                        Acompanhe o consumo de recursos do seu plano <strong>{data.plan}</strong>.
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-1 text-sm border-primary/20 bg-primary/5 text-primary">
                    Plano {data.plan}
                </Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <UsageCard
                    title="Usuários Ativos"
                    icon={Users}
                    metric={data.usage.users}
                />
                <UsageCard
                    title="Artigos Publicados"
                    icon={FileText}
                    metric={data.usage.articles}
                />
                <UsageCard
                    title="Armazenamento"
                    icon={HardDrive}
                    metric={data.usage.storage_mb}
                />
            </div>

            {/* Suggestion / Upsell Area */}
            <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/10">
                <CardHeader>
                    <CardTitle>Precisa de mais recursos?</CardTitle>
                    <CardDescription>
                        Seu negócio está crescendo rápido. Considere fazer um upgrade para desbloquear limites maiores.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
                        Ver Planos Disponíveis
                    </Badge>
                </CardContent>
            </Card>
        </div>
        </Protected>
    )
}
