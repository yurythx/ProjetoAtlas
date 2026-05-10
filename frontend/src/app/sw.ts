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
