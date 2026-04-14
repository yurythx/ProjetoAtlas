"use client"

import { PageHeader } from "@/components/ui/page-header"
import { ModuleGuard } from "@/components/module-guard"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const CalendarView = dynamic(
  () => import("@/features/calendar/calendar-view").then((m) => m.CalendarView),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm" role="status" aria-live="polite" aria-label="Carregando calendário">
        <Skeleton className="h-[800px] w-full rounded-2xl" />
      </div>
    ),
  }
)

export default function CalendarPage() {
  return (
    <ModuleGuard moduleCode="calendar">
      <div className="space-y-6">
        <PageHeader
          title="Agenda"
          description="Gerencie seus eventos e compromissos."
        />
        
        <div className="min-h-[800px]">
          <CalendarView />
        </div>
      </div>
    </ModuleGuard>
  )
}
