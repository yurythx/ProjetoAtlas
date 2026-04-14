import axios from "axios"

import { isJwtExpired } from "./jwt"

type RefreshResponse = {
  access: string
  refresh?: string
}

export async function ensureFreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null

  const access = localStorage.getItem("accessToken")
  if (!access) return null
  if (!isJwtExpired(access)) return access

  const refresh = localStorage.getItem("refreshToken")
  if (!refresh) return null

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8005"
  const companySlug = localStorage.getItem("companySlug") || process.env.NEXT_PUBLIC_COMPANY_SLUG || ""
  const headers = companySlug ? { "X-Company-Slug": companySlug } : undefined

  const response = await axios.post<RefreshResponse>(
    `${apiUrl.replace(/\/$/, "")}/api/accounts/token/refresh/`,
    { refresh },
    { headers }
  )

  const newAccess = response.data.access
  localStorage.setItem("accessToken", newAccess)
  if (response.data.refresh) {
    localStorage.setItem("refreshToken", response.data.refresh)
  }

  return newAccess
}

