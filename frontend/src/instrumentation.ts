import * as Sentry from "@sentry/nextjs"

export const onRequestError = Sentry.captureRequestError

export function register() {
  const runtime = process.env.NEXT_RUNTIME
  if (runtime !== "nodejs" && runtime !== "edge") return

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  })
}
