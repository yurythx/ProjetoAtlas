"use client"

import { useEffect } from "react"

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return
    if (typeof window === "undefined") return

    const flag = "dev-sw-reset:v1"
    try {
      if (window.sessionStorage.getItem(flag) === "1") return
      window.sessionStorage.setItem(flag, "1")
    } catch {
      return
    }

    const run = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((r) => r.unregister()))
        }
        if ("caches" in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((key) => caches.delete(key)))
        }
      } finally {
        window.location.reload()
      }
    }

    void run()
  }, [])

  return null
}

