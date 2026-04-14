"use client"

import { ModuleGuard } from "@/components/module-guard"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const MessengerView = dynamic(
  () => import("@/features/messenger/messenger-view").then((m) => m.MessengerView),
  {
    ssr: false,
    loading: () => (
      <div className="h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-primary/5 bg-card/30" role="status" aria-live="polite" aria-label="Carregando mensagens">
        <div className="p-4 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-[520px] w-full rounded-2xl" />
        </div>
      </div>
    ),
  }
)

export default function MessengerPage() {
  return (
    <ModuleGuard moduleCode="messenger">
      <div className="h-[calc(100vh-6rem)]">
        <MessengerView />
      </div>
    </ModuleGuard>
  )
}
