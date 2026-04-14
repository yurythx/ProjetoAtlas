import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function ArtigosLoading() {
    return (
        <div className="h-full space-y-8" role="status" aria-live="polite" aria-label="Carregando artigos do dashboard">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-3">
                    <Skeleton className="h-10 w-72 rounded-2xl" />
                    <Skeleton className="h-5 w-[450px] rounded-lg" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-10 w-24 rounded-xl" />
                    <Skeleton className="h-10 w-24 rounded-xl" />
                </div>
            </div>

            <div className="w-full">
                <div className="bg-muted/30 p-1 rounded-xl w-fit flex gap-1">
                    <Skeleton className="h-9 w-28 rounded-xl" />
                    <Skeleton className="h-9 w-44 rounded-xl" />
                </div>

                <div className="mt-8 space-y-6">
                    <div className="flex justify-between items-center bg-muted/10 p-4 rounded-2xl border border-dashed">
                        <Skeleton className="h-10 w-1/3 rounded-xl" />
                        <Skeleton className="h-10 w-36 rounded-2xl" />
                    </div>
                    <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
                        <TableSkeleton rows={6} columns={4} />
                    </div>
                </div>
            </div>
        </div>
    )
}
