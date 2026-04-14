"use client"

import { InsightsDashboard } from "@/features/dashboard/insights-dashboard"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Loader2, TrendingUp } from "lucide-react"

export default function InsightsPage() {
    const { data: licenseData, isLoading } = useQuery({
        queryKey: ['licensing-usage'],
        queryFn: async ({ signal }) => {
            const res = await api.get('/api/licensing/my-license/', { signal })
            return res.data
        }
    })

    // Simula verificação de feature 'advanced_analytics'
    // No mundo real, verificaríamos se 'advanced_analytics' está nos presets do plano
    const isPremium = licenseData?.limits?.advanced_analytics === 'true' ||
        licenseData?.limits?.advanced_analytics === 'unlimited' ||
        licenseData?.plan === 'Enterprise' ||
        licenseData?.plan === 'Premium'

    const moderationQuery = useQuery({
        queryKey: ['articles', 'moderation_metrics'],
        queryFn: async ({ signal }) => {
            const res = await api.get('/api/articles/articles/moderation_metrics/', { signal })
            return res.data
        },
        enabled: Boolean(isPremium),
        retry: false,
    })

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]" role="status" aria-live="polite" aria-label="Carregando insights">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            </div>
        )
    }

    return (
        <div className="container mx-auto px-6 py-8 space-y-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                        <TrendingUp className="h-8 w-8 text-primary" aria-hidden="true" />
                        Insights de Engajamento
                    </h1>
                    <p className="text-muted-foreground mt-1">Análise profunda da performance do seu ecossistema.</p>
                </div>
            </div>

            <InsightsDashboard isPremium={isPremium} moderationMetrics={moderationQuery.data ?? null} />
        </div>
    )
}
