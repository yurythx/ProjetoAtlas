import { Skeleton, DashboardCardSkeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
    return (
        <div className="space-y-12 pb-20" role="status" aria-live="polite" aria-label="Carregando dashboard">
            {/* Hero Skeleton - Matching DjangoHero height/layout */}
            <div className="-mx-8 -mt-8">
                <div className="h-[400px] w-full bg-muted/20 animate-pulse flex flex-col justify-center px-12 space-y-6 border-b">
                    <div className="space-y-3">
                        <Skeleton className="h-14 w-[60%] rounded-2xl" />
                        <Skeleton className="h-6 w-[40%] rounded-xl" />
                    </div>
                    <div className="flex gap-4 pt-4">
                        <Skeleton className="h-12 w-40 rounded-full" />
                        <Skeleton className="h-12 w-40 rounded-full" />
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-6 space-y-16">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <DashboardCardSkeleton />
                    <DashboardCardSkeleton />
                    <DashboardCardSkeleton />
                </div>

                {/* Analytics Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <div className="h-[400px] rounded-2xl border border-primary/5 bg-card/30 p-8 flex flex-col space-y-6">
                            <div className="flex justify-between items-center">
                                <Skeleton className="h-6 w-48" />
                                <div className="flex gap-2">
                                    <Skeleton className="h-8 w-24" />
                                    <Skeleton className="h-8 w-24" />
                                </div>
                            </div>
                            <Skeleton className="flex-1 w-full rounded-xl" />
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-primary/5 glass-morphism p-6 space-y-6">
                            <Skeleton className="h-4 w-32" />
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-3 items-center">
                                        <Skeleton className="h-8 w-8 rounded-lg" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                    <Skeleton className="h-4 w-12 rounded-full" />
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-3 items-center">
                                        <Skeleton className="h-8 w-8 rounded-lg" />
                                        <Skeleton className="h-4 w-28" />
                                    </div>
                                    <Skeleton className="h-4 w-12 rounded-full" />
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-3 items-center">
                                        <Skeleton className="h-8 w-8 rounded-lg" />
                                        <Skeleton className="h-4 w-20" />
                                    </div>
                                    <Skeleton className="h-4 w-12 rounded-full" />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 rounded-2xl border bg-background/90 shadow-inner flex flex-col items-center gap-3">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-8 w-32" />
                        </div>
                    </div>
                </div>

                {/* Activity vs Content Split */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                    <section className="space-y-6">
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-8 w-24" />
                        </div>
                        <div className="rounded-2xl border bg-card/5 backdrop-blur-sm p-1">
                            <div className="divide-y divide-border/30">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="flex justify-between items-center p-4">
                                        <div className="flex gap-4 items-center">
                                            <Skeleton className="h-2 w-2 rounded-full" />
                                            <div className="space-y-2">
                                                <Skeleton className="h-4 w-40" />
                                                <Skeleton className="h-3 w-32" />
                                            </div>
                                        </div>
                                        <Skeleton className="h-4 w-12" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <Skeleton className="h-8 w-56" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Skeleton className="h-24 w-full rounded-2xl" />
                            <Skeleton className="h-24 w-full rounded-2xl" />
                            <Skeleton className="h-24 w-full rounded-2xl" />
                            <Skeleton className="h-24 w-full rounded-2xl" />
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
