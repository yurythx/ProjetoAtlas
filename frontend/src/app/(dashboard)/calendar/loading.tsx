import { Skeleton } from "@/components/ui/skeleton"

export default function CalendarLoading() {
  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Carregando agenda">
      <div className="space-y-3">
        <Skeleton className="h-10 w-48 rounded-2xl" />
        <Skeleton className="h-5 w-[420px] max-w-full rounded-lg" />
      </div>

      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </div>
    </div>
  )
}

