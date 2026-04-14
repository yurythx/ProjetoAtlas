import { Skeleton } from "@/components/ui/skeleton"

export default function NotificationsLoading() {
  return (
    <div className="max-w-5xl mx-auto py-8 space-y-8" role="status" aria-live="polite" aria-label="Carregando notificações">
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-10 w-72 rounded-2xl" />
          <Skeleton className="h-5 w-[520px] max-w-full rounded-lg" />
        </div>
        <Skeleton className="h-12 w-56 rounded-xl" />
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-28 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-3xl bg-muted/20 animate-pulse border border-border/50" />
        ))}
      </div>
    </div>
  )
}

