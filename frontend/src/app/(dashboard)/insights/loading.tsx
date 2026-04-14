import { Skeleton } from "@/components/ui/skeleton"

export default function InsightsLoading() {
    return (
        <div className="space-y-8" role="status" aria-live="polite" aria-label="Carregando insights">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-3">
                    <Skeleton className="h-10 w-48 rounded-2xl" />
                    <Skeleton className="h-5 w-80 rounded-lg" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-10 w-28 rounded-xl" />
                    <Skeleton className="h-10 w-28 rounded-xl" />
                </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-primary/5 bg-card/30 p-5 space-y-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                ))}
            </div>

            {/* Charts area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-2xl border border-primary/5 bg-card/30 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-8 w-32 rounded-xl" />
                    </div>
                    <Skeleton className="h-[280px] w-full rounded-xl" />
                </div>
                <div className="rounded-2xl border border-primary/5 bg-card/30 p-6 space-y-4">
                    <Skeleton className="h-5 w-36" />
                    <div className="space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton className="h-3 w-3 rounded-full flex-shrink-0" />
                                <Skeleton className="h-4 flex-1" />
                                <Skeleton className="h-4 w-10" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
