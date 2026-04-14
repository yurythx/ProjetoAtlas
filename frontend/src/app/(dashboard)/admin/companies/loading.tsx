import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

export default function AdminCompaniesLoading() {
  return (
    <div className="container mx-auto py-8 space-y-8" role="status" aria-live="polite" aria-label="Carregando empresas">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-72 rounded-xl" />
            <Skeleton className="h-4 w-[420px] max-w-[60vw] rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm space-y-4">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <TableSkeleton rows={7} columns={5} />
      </div>
    </div>
  )
}

