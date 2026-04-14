"use client"

import { Header } from "@/components/layout/header"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"


import { useUIStore } from "@/hooks/use-ui-store"

const Sidebar = dynamic(() => import("@/components/layout/sidebar").then((m) => m.Sidebar), {
  ssr: false,
})

const SetupAlert = dynamic(() => import("@/components/layout/setup-alert").then((m) => m.SetupAlert), {
  ssr: false,
})

export function DashboardShell({
  children,
}: {
  children: React.ReactNode
}) {
  const { isSidebarCollapsed } = useUIStore()

  const showSidebar = true

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      {showSidebar && <Sidebar />}
      <div
        className={cn(
          "flex flex-col flex-1 min-h-0 transition-all duration-300 ease-in-out",
          showSidebar ? (isSidebarCollapsed ? "md:pl-20" : "md:pl-72") : "pl-0"
        )}
      >
        <SetupAlert />

        <main className="flex-1 px-4 py-6 sm:p-6 md:p-8 overflow-y-auto overflow-x-hidden" role="main" aria-label="Conteúdo principal do dashboard">
          <div className="w-full min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
