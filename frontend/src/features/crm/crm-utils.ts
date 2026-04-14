"use client"

export function normalizeListResponse<T>(data: T[] | { results?: T[] } | undefined): T[] {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.results)) return data.results
  return []
}

export type CRMUserLite = {
  id: number
  username: string
  first_name?: string
  last_name?: string
  email?: string
}

export function getUserDisplayName(user: CRMUserLite) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim()
  return fullName || user.username
}

export function getUserInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return "?"
  return parts.map((part) => part[0]?.toUpperCase()).join("")
}

export function getLocalDateYYYYMMDD(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function dateOnlyToLocalDateTime(date: string, hour = 12) {
  const safeHour = Math.max(0, Math.min(23, hour))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return `${date}T${String(safeHour).padStart(2, "0")}:00:00`
}

