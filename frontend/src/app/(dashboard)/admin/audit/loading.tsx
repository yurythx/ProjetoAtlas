import { Skeleton } from "@/components/ui/skeleton"

export default function AdminAuditLoading() {
  return (
    <div className="max-w-6xl mx-auto py-8 space-y-8" role="status" aria-live="polite" aria-label="Carregando auditoria">
      <div className="space-y-3">
        <Skeleton className="h-10 w-72 rounded-2xl" />
        <Skeleton className="h-5 w-[520px] max-w-full rounded-lg" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>

      <div className="rounded-[2.5rem] border border-border/50 bg-card/30 overflow-hidden shadow-2xl">
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 w-full rounded-2xl bg-muted/20 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

