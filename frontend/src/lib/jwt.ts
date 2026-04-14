export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const payload = parts[1]
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
    const json = atob(padded)
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function isJwtExpired(token: string, leewaySeconds = 15): boolean {
  const payload = parseJwt(token)
  const exp = payload?.exp
  if (typeof exp !== "number") return false
  const now = Math.floor(Date.now() / 1000)
  return exp <= now + leewaySeconds
}

