// loading.tsx — Messenger route skeleton.
// Shown by Next.js while the messenger page and its data fetching resolve.
import { Skeleton } from "@/components/ui/skeleton"

export default function MessengerLoading() {
    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-primary/5 bg-card/30" role="status" aria-live="polite" aria-label="Carregando mensagens">
            {/* Sidebar skeleton */}
            <div className="w-80 border-r border-border/40 flex flex-col">
                <div className="p-4 border-b border-border/40">
                    <Skeleton className="h-10 w-full rounded-xl" />
                </div>
                <div className="flex-1 p-3 space-y-2 overflow-hidden">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                            <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                            <div className="flex-1 space-y-2 min-w-0">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main chat area skeleton */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="p-4 border-b border-border/40 flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 p-6 space-y-4 overflow-hidden flex flex-col justify-end">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                            <Skeleton
                                className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-2/5' : 'w-1/3'}`}
                            />
                        </div>
                    ))}
                </div>

                {/* Input */}
                <div className="p-4 border-t border-border/40">
                    <Skeleton className="h-12 w-full rounded-2xl" />
                </div>
            </div>
        </div>
    )
}
