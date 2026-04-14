"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body>
        <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Ocorreu um erro inesperado</h1>
          <p style={{ marginTop: 8, color: "rgba(0,0,0,0.7)" }}>
            Atualize a página. Se o problema persistir, entre em contato com o suporte.
          </p>
        </main>
      </body>
    </html>
  )
}

