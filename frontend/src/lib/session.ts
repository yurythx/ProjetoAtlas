export function setHasSessionCookie(maxAgeSeconds = 60 * 60 * 24 * 7) {
  if (typeof document === "undefined") return
  const secure =
    typeof window !== "undefined" && typeof window.location?.protocol === "string"
      ? window.location.protocol === "https:"
      : false
  document.cookie = `hasSession=true; path=/; SameSite=Lax; max-age=${maxAgeSeconds}${secure ? "; Secure" : ""}`
}

export function clearHasSessionCookie() {
  if (typeof document === "undefined") return
  const secure =
    typeof window !== "undefined" && typeof window.location?.protocol === "string"
      ? window.location.protocol === "https:"
      : false
  document.cookie = `hasSession=; path=/; SameSite=Lax; max-age=0${secure ? "; Secure" : ""}`
}

export function ensureHasSessionCookie() {
  if (typeof window === "undefined") return

  const hasTokens = Boolean(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))
  if (!hasTokens) return

  const hasSessionCookie = document.cookie
    .split(";")
    .map((s) => s.trim())
    .some((c) => c === "hasSession=true" || c.startsWith("hasSession=true;") || c.startsWith("hasSession=true"))

  if (!hasSessionCookie) {
    setHasSessionCookie()
  }
}

export function clearClientSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("accessToken")
    localStorage.removeItem("refreshToken")
    localStorage.removeItem("companySlug")
  }
  clearHasSessionCookie()
}
