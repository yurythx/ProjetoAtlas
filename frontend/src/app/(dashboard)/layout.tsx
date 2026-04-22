"use client"

import { DashboardShell } from "@/components/layout/dashboard-shell"
import { PresenceHeartbeat } from "@/components/layout/presence-heartbeat"
import { PresenceProvider } from "@/hooks/use-presence"
import * as React from "react"
import { clearClientSession, ensureHasSessionCookie } from "@/lib/session"
import { CRMAttachmentOfflineSync } from "@/features/crm/offline-attachment-sync"

import { CommandPalette } from "@/components/layout/command-palette"

/**
 * DashboardLayout — proteção primária feita via middleware.ts (server-side).
 * Este layout assume que o usuário já está autenticado.
 * O middleware redireciona para /login antes mesmo de renderizar esta página.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  React.useEffect(() => {
    const hasTokens = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))
    if (!hasTokens) {
      clearClientSession()
      window.location.href = "/login"
      return
    }
    ensureHasSessionCookie()
  }, [])

  return (
    <PresenceProvider>
      <DashboardShell>
        <PresenceHeartbeat />
        <CRMAttachmentOfflineSync />
        <CommandPalette />
        {children}
      </DashboardShell>
    </PresenceProvider>
  )
}
