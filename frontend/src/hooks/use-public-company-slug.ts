"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { api } from "@/lib/axios"

export function usePublicCompanySlug() {
  const searchParams = useSearchParams()
  const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG || null
  const companySlugFromQuery = React.useMemo(() => {
    const v = (searchParams.get("company_slug") || "").trim()
    return v || null
  }, [searchParams])

  const [companySlug, setCompanySlug] = React.useState<string | null>(() => {
    if (companySlugFromQuery) return companySlugFromQuery
    const saved = typeof window !== "undefined" ? localStorage.getItem("companySlug") : null
    return (saved || envCompany || null)
  })
  const [isResolving, setIsResolving] = React.useState(false)

  React.useEffect(() => {
    if (companySlugFromQuery && companySlugFromQuery !== companySlug) {
      localStorage.setItem("companySlug", companySlugFromQuery)
      setCompanySlug(companySlugFromQuery)
    }
  }, [companySlugFromQuery, companySlug])

  React.useEffect(() => {
    let active = true
    const resolve = async () => {
      if (companySlug) return
      setIsResolving(true)
      try {
        const res = await api.get<{ slug: string }[]>("/api/core/companies/public_list/")
        const list = Array.isArray(res.data) ? res.data : []
        if (!active) return
        if (list.length !== 1) return
        const picked = list[0]?.slug
        if (!picked) return
        localStorage.setItem("companySlug", picked)
        setCompanySlug(picked)
      } finally {
        if (active) setIsResolving(false)
      }
    }
    resolve()
    return () => {
      active = false
    }
  }, [companySlug])

  return { companySlug, isResolving }
}
