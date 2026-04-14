"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    const hasTokens = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))
    router.replace(hasTokens ? "/dashboard" : "/p/artigos")
  }, [router])

  return null
}
