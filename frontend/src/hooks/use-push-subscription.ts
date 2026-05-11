"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"

type PushStatus = "unsupported" | "denied" | "subscribed" | "unsubscribed" | "loading"

interface PushSubscriptionRecord {
  id: number
  endpoint: string
  p256dh: string
  auth: string
  is_active: boolean
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

export function usePushSubscription() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<PushStatus>("loading")

  // Fetch VAPID public key from backend
  const { data: vapidData } = useQuery({
    queryKey: ["notifications", "vapid-public-key"],
    queryFn: async () => {
      const res = await api.get<{ vapid_public_key: string }>(
        "/api/notifications/push-subscriptions/vapid_public_key/"
      )
      return res.data
    },
    staleTime: Infinity,
  })

  const vapidPublicKey = vapidData?.vapid_public_key ?? ""

  // Fetch current subscriptions for this user
  const { data: subscriptions = [] } = useQuery<PushSubscriptionRecord[]>({
    queryKey: ["notifications", "push-subscriptions"],
    queryFn: async () => {
      const res = await api.get<PushSubscriptionRecord[]>("/api/notifications/push-subscriptions/")
      return Array.isArray(res.data) ? res.data : (res.data as { results?: PushSubscriptionRecord[] }).results ?? []
    },
  })

  // Determine status based on browser + backend state
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported")
      return
    }
    if (Notification.permission === "denied") {
      setStatus("denied")
      return
    }
    const hasActive = subscriptions.some((s) => s.is_active)
    setStatus(hasActive ? "subscribed" : "unsubscribed")
  }, [subscriptions])

  const subscribe = useMutation({
    mutationFn: async () => {
      if (!vapidPublicKey) throw new Error("Chave VAPID não configurada no servidor.")

      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setStatus("denied")
        throw new Error("Permissão de notificação negada pelo usuário.")
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const json = subscription.toJSON()
      const keys = json.keys as { p256dh: string; auth: string }

      await api.post("/api/notifications/push-subscriptions/", {
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "push-subscriptions"] })
      setStatus("subscribed")
    },
  })

  const unsubscribe = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Remove from backend — match by endpoint
        const record = subscriptions.find((s) => s.endpoint === subscription.endpoint)
        if (record) {
          await api.delete(`/api/notifications/push-subscriptions/${record.id}/`)
        }
        await subscription.unsubscribe()
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", "push-subscriptions"] })
      setStatus("unsubscribed")
    },
  })

  const toggle = useCallback(() => {
    if (status === "subscribed") {
      unsubscribe.mutate()
    } else if (status === "unsubscribed") {
      subscribe.mutate()
    }
  }, [status, subscribe, unsubscribe])

  return {
    status,
    toggle,
    isPending: subscribe.isPending || unsubscribe.isPending,
    subscribeError: subscribe.error,
    unsubscribeError: unsubscribe.error,
  }
}
