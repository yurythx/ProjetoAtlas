import { Skeleton } from "@/components/ui/skeleton"

export default function FinanceLoading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Carregando financeiro">
      <div className="space-y-3">
        <Skeleton className="h-10 w-52 rounded-2xl" />
        <Skeleton className="h-5 w-[420px] max-w-full rounded-lg" />
      </div>

      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-primary/5 bg-card/30 p-5 space-y-3">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-40 rounded-xl" />
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      </div>
    </div>
  )
}

