// loading.tsx — Admin route skeleton.
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function AdminLoading() {
    return (
        <div className="space-y-8" role="status" aria-live="polite" aria-label="Carregando painel administrativo">
            {/* Page header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-3">
                    <Skeleton className="h-10 w-64 rounded-2xl" />
                    <Skeleton className="h-5 w-96 rounded-lg" />
                </div>
                <Skeleton className="h-10 w-36 rounded-xl" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-primary/5 bg-card/30 p-5 space-y-3">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-8 w-16" />
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <Skeleton className="h-9 w-60 rounded-xl" />
                    <Skeleton className="h-9 w-32 rounded-xl" />
                </div>
                <TableSkeleton rows={7} columns={5} />
            </div>
        </div>
    )
}
