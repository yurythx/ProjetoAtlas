import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function CMSLoading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Carregando páginas">
      <div className="space-y-3">
        <Skeleton className="h-10 w-72 rounded-2xl" />
        <Skeleton className="h-5 w-[520px] max-w-full rounded-lg" />
      </div>

      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
        <TableSkeleton rows={7} columns={4} />
      </div>
    </div>
  )
}

