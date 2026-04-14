"use client"

import { LucideIcon, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface StatsCardProps {
    title: string
    value: string | number
    description?: string
    icon: LucideIcon
    isLoading?: boolean
    trend?: {
        value: number
        label: string
        isPositive: boolean
    }
    className?: string
}

export function StatsCard({
    title,
    value,
    description,
    icon: Icon,
    isLoading,
    trend,
    className,
}: StatsCardProps) {
    if (isLoading) {
        return (
            <div className={cn("glass p-6 rounded-3xl border h-full flex flex-col justify-between", className)} role="status" aria-live="polite" aria-label="Carregando estatísticas">
                <div className="flex justify-between items-center mb-4">
                    <Skeleton className="h-12 w-12 rounded-2xl" aria-hidden="true" />
                    <Skeleton className="h-6 w-16 rounded-full" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-1/2" aria-hidden="true" />
                    <Skeleton className="h-8 w-2/3" aria-hidden="true" />
                    <Skeleton className="h-3 w-1/3 mt-2" aria-hidden="true" />
                </div>
            </div>
        )
    }
    return (
        <div
            className={cn(
                "glass-card p-6 rounded-3xl shadow-sm border h-full flex flex-col justify-between transition-all hover:shadow-xl hover:shadow-primary/5 group hover:-translate-y-1",
                className
            )}
        >
            <div className="flex items-center justify-between mb-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center transition-colors group-hover:bg-primary/20">
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                {trend && (
                    <div className={cn(
                        "flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full",
                        trend.isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    )}>
                        {trend.isPositive ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
                        {trend.value}%
                    </div>
                )}
            </div>

            <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-[0.1em]">
                    {title}
                </p>
                <h3 className="text-3xl font-bold tracking-tight">
                    {value}
                </h3>
                {description && (
                    <p className="text-xs text-muted-foreground mt-2 font-medium">
                        {description}
                    </p>
                )}
            </div>
        </div>
    )
}
