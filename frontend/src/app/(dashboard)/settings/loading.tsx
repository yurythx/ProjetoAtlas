import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsLoading() {
    return (
        <div className="max-w-4xl mx-auto space-y-8" role="status" aria-live="polite" aria-label="Carregando configurações">
            {/* Header */}
            <div className="space-y-2">
                <Skeleton className="h-9 w-52 rounded-2xl" />
                <Skeleton className="h-5 w-80 rounded-lg" />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border/40 pb-0">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-28 rounded-t-xl" />
                ))}
            </div>

            {/* Settings form */}
            <div className="rounded-2xl border border-primary/5 bg-card/30 p-8 space-y-8">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="space-y-2">
                            <Skeleton className="h-4 w-28" />
                            <Skeleton className="h-11 w-full rounded-xl" />
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-border/30">
                    <Skeleton className="h-10 w-24 rounded-xl" />
                    <Skeleton className="h-10 w-32 rounded-xl" />
                </div>
            </div>
        </div>
    )
}
