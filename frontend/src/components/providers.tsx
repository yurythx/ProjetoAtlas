"use client"

import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import { ThemeProvider } from "./theme-provider"
import { useState, useEffect } from "react"
import { Toaster } from "sonner"
import { UnauthorizedModalHost } from "@/components/unauthorized-modal-host"
import { clearHasSessionCookie, ensureHasSessionCookie } from "@/lib/session"

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
  key: () => null,
  get length() {
    return 0
  },
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasTokens = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))
      const hasSessionCookie = document.cookie
        .split(";")
        .map((s) => s.trim())
        .some((c) => c === "hasSession=true" || c.startsWith("hasSession=true;") || c.startsWith("hasSession=true"))
      if (hasSessionCookie && !hasTokens) clearHasSessionCookie()
      if (hasTokens) ensureHasSessionCookie()
    }

    if (!("serviceWorker" in navigator)) return

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister()
        })
      })

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            if (key.startsWith("workbox-") || key.includes("precache")) {
              caches.delete(key)
            }
          })
        })
      }

      return
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, []);

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      }
    }
  }))

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== 'undefined' ? window.localStorage : noopStorage,
    })
  )

  return (
    <PersistQueryClientProvider 
      client={queryClient}
      persistOptions={{ persister }}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <UnauthorizedModalHost />
        <Toaster
          position="bottom-right"
          expand={true}
          richColors
          closeButton
          theme="system"
          toastOptions={{
            style: {
              borderRadius: '12px',
              padding: '16px',
            },
          }}
        />
      </ThemeProvider>
    </PersistQueryClientProvider>
  )
}
