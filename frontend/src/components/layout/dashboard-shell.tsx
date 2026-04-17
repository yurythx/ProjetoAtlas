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

        <main className="flex-1 overflow-y-auto overflow-x-hidden safe-area-bottom" role="main" aria-label="Conteúdo principal do dashboard">
          <div className="content-frame py-6 md:py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
