import { Skeleton } from "@/components/ui/skeleton"

export default function LicensingLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 space-y-16" role="status" aria-live="polite" aria-label="Carregando planos e licenças">
      <div className="text-center space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-6 w-52 rounded-full mx-auto" />
        <Skeleton className="h-12 w-[720px] max-w-full rounded-2xl mx-auto" />
        <Skeleton className="h-6 w-[560px] max-w-full rounded-xl mx-auto" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end pb-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-primary/5 bg-card/30 p-6 shadow-sm space-y-6">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40 rounded-xl" />
              <Skeleton className="h-10 w-56 rounded-2xl" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  )
}

