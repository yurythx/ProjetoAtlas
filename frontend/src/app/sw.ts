/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // skipWaiting: false avoids the mid-session takeover that caused flickering
  // in next-pwa. The new SW activates only when all tabs using the old SW close.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API routes — always go to network, 10s timeout before falling back to cache
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "atlas-api",
        networkTimeoutSeconds: 10,
        plugins: [],
      }),
      method: "GET",
    },
    // Next.js static assets — safe to cache long-term (hashed filenames)
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new StaleWhileRevalidate({
        cacheName: "atlas-next-static",
      }),
      method: "GET",
    },
    // Fall back to defaultCache for everything else (fonts, images, etc.)
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// --- Web Push ---

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; data?: { url?: string } } = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Atlas", body: event.data.text() };
  }

  const title = payload.title ?? "Atlas";
  const options: NotificationOptions = {
    body: payload.body ?? "",
    icon: "/icon-192x192.png",
    badge: "/icon-96x96.png",
    data: payload.data ?? {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const url: string = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    (self.clients as Clients).matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          void (client as WindowClient).focus();
          return;
        }
      }
      return (self.clients as Clients).openWindow(url);
    })
  );
});
