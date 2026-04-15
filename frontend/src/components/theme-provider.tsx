"use client"

import * as React from "react"
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react"
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"
import { api } from "@/lib/axios"
import { usePathname } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"

// --- Types ---
interface TenantTheme {
  primary_color: string
  secondary_color: string
  background_color: string
  font_family: string
  logo: string
  icon: string
  footer_text: string
  facebook_url?: string
  instagram_url?: string
  linkedin_url?: string
  twitter_url?: string
  theme_palette?: string
  custom_css?: string
  custom_js?: string
}

interface UserPreferences {
  theme_palette?: string
  use_tenant_theme: boolean
  dark_mode_preference?: "light" | "dark" | "system"
  font_size?: string
}

interface ThemeConfigShape {
  logo: string | null
  icon: string | null
  companyName: string | null
  footerText: string | null
  primaryColor: string
  secondaryColor: string | null
  backgroundColor: string | null
  fontFamily: string | null
  customCss: string | null
  customJs: string | null
  socialLinks: {
    facebook: string | null
    instagram: string | null
    linkedin: string | null
    twitter: string | null
  }
  currentPalette: string
  isLoading: boolean
  isPublicRoute: boolean
  tenantTheme: TenantTheme | null
  userTheme: UserPreferences | null
  refreshConfig: () => Promise<void>
  updatePalette: (palette: string) => Promise<void>
  resetToTenantTheme: () => Promise<void>
  updateDarkModePreference: (mode: "light" | "dark" | "system") => Promise<void>
}

// --- Context & Hook ---
const BrandingContext = createContext<ThemeConfigShape | undefined>(undefined)

/**
 * Hook to access Atlas branding and theme configuration.
 * Distinct from next-themes' useTheme.
 */
export function useBranding() {
  const context = useContext(BrandingContext)
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return context
}

// Re-export for easier migration in components that already use 'useTheme' 
// but we should eventually rename them to useBranding
export { useBranding as useTheme }

// --- Internal Implementation ---

function getContrastColor(hex: string) {
  if (!hex) return '#FFFFFF'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#FFFFFF'
}

function useThemeHooks(): ThemeConfigShape {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const isPublicRoute = useMemo(() => {
    if (!pathname) return true;
    const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/accept-invite"];
    return publicPaths.includes(pathname) || pathname.startsWith("/p/");
  }, [pathname])

  const [tenantTheme, setTenantTheme] = useState<TenantTheme | null>(null)
  const [userTheme, setUserTheme] = useState<UserPreferences | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchConfig = useCallback(async () => {
    setIsLoading(true)
    try {
      // Check if user is logged in
      const token = typeof window !== "undefined" ? localStorage.getItem('accessToken') : null
      const effectiveCompany =
        typeof window !== "undefined"
          ? localStorage.getItem("companySlug") || process.env.NEXT_PUBLIC_COMPANY_SLUG || "unknown"
          : process.env.NEXT_PUBLIC_COMPANY_SLUG || "unknown"

      // Fetch Tenant branding
      // Use public endpoint for public routes or when not authenticated to avoid 401 loops
      const endpoint = (isPublicRoute || !token)
        ? '/api/core/branding/public_current/'
        : '/api/core/branding/current/';

      const brandingRes = await api.get(endpoint)
      setTenantTheme(brandingRes.data)

      // Persist for the init script
      localStorage.setItem('atlas_tenant_branding', JSON.stringify(brandingRes.data))

      // Fetch User preferences ONLY if not a public route AND user has token
      if (!isPublicRoute && token) {
        try {
          const cachedPrefs = queryClient.getQueryData<UserPreferences>(["accounts", "preferences", "theme", effectiveCompany])
          const prefRes = cachedPrefs ? { data: cachedPrefs } : await api.get("/api/accounts/preferences/theme/current/")
          const prefs: UserPreferences = {
            theme_palette: prefRes.data.theme_palette || undefined,
            use_tenant_theme: prefRes.data.use_tenant_theme !== false,
            dark_mode_preference: prefRes.data.dark_mode_preference || "system",
          }
          setUserTheme(prefs)
          localStorage.setItem('atlas_user_preferences', JSON.stringify(prefs))
          queryClient.setQueryData(["accounts", "preferences", "theme", effectiveCompany], prefs)
        } catch (e) {
          // Silent fail for user prefs if token is invalid, but don't break the app
          console.warn("Could not load user theme prefs", e)
        }
      }
    } catch (error) {
      console.error("Failed to load theme config", error)
    } finally {
      setIsLoading(false)
    }
  }, [isPublicRoute, queryClient])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  const updatePalette = async (palette: string) => {
    try {
      await api.patch("/api/accounts/preferences/theme/update_current/", {
        theme_palette: palette,
        use_tenant_theme: false
      })
      if (typeof window !== "undefined") {
        queryClient.invalidateQueries({ queryKey: ["accounts", "preferences", "theme"] })
      }
      await fetchConfig()
    } catch (err) {
      console.error("Failed to update palette", err)
    }
  }

  const resetToTenantTheme = async () => {
    try {
      await api.post("/api/accounts/preferences/theme/reset/")
      if (typeof window !== "undefined") {
        queryClient.invalidateQueries({ queryKey: ["accounts", "preferences", "theme"] })
      }
      await fetchConfig()
    } catch (err) {
      console.error("Failed to reset theme", err)
    }
  }

  const updateDarkModePreference = async (mode: "light" | "dark" | "system") => {
    try {
      await api.patch("/api/accounts/preferences/theme/update_current/", { dark_mode_preference: mode })
      if (typeof window !== "undefined") {
        queryClient.invalidateQueries({ queryKey: ["accounts", "preferences", "theme"] })
      }
      await fetchConfig()
    } catch (err) {
      console.error("Failed to update dark mode preference", err)
    }
  }

  const currentPalette = useMemo(() => {
    if (!isPublicRoute && userTheme && !userTheme.use_tenant_theme && userTheme.theme_palette) {
      return userTheme.theme_palette
    }
    return tenantTheme?.theme_palette || 'django-green'
  }, [userTheme, tenantTheme, isPublicRoute])

  return {
    logo: tenantTheme?.logo || null,
    icon: tenantTheme?.icon || null,
    companyName: tenantTheme?.footer_text?.split('.')[0]?.replace('©', '')?.trim() || "Atlas",
    footerText: tenantTheme?.footer_text || null,
    primaryColor: tenantTheme?.primary_color || '#0C4B33',
    secondaryColor: tenantTheme?.secondary_color || null,
    backgroundColor: tenantTheme?.background_color || null,
    fontFamily: tenantTheme?.font_family || null,
    customCss: tenantTheme?.custom_css || null,
    customJs: tenantTheme?.custom_js || null,
    socialLinks: {
      facebook: tenantTheme?.facebook_url || null,
      instagram: tenantTheme?.instagram_url || null,
      linkedin: tenantTheme?.linkedin_url || null,
      twitter: tenantTheme?.twitter_url || null,
    },
    currentPalette,
    isLoading,
    isPublicRoute,
    tenantTheme,
    userTheme,
    refreshConfig: fetchConfig,
    updatePalette,
    resetToTenantTheme,
    updateDarkModePreference,
  }
}

function ThemeEffects({ themeConfig }: { themeConfig: ThemeConfigShape }) {
  const { resolvedTheme, theme, setTheme } = useNextTheme()

  useEffect(() => {
    if (typeof window !== "undefined") {
      const root = document.documentElement
      root.setAttribute("data-palette", themeConfig.currentPalette)

      const shouldUseTenantColor = themeConfig.isPublicRoute || themeConfig.userTheme?.use_tenant_theme !== false

      if (shouldUseTenantColor && themeConfig.tenantTheme?.primary_color) {
        if (resolvedTheme !== 'dark') {
          const primaryHex = themeConfig.tenantTheme.primary_color
          root.style.setProperty('--primary', primaryHex)
          const foregroundHex = getContrastColor(primaryHex)
          root.style.setProperty('--primary-foreground', foregroundHex)
        } else {
          root.style.removeProperty('--primary')
          root.style.removeProperty('--primary-foreground')
        }
      } else {
        root.style.removeProperty('--primary')
        root.style.removeProperty('--primary-foreground')
      }

      if (themeConfig.secondaryColor) {
        const secondaryHex = themeConfig.secondaryColor
        root.style.setProperty('--secondary', secondaryHex)
        const foregroundHex = getContrastColor(secondaryHex)
        root.style.setProperty('--secondary-foreground', foregroundHex)
      } else {
        root.style.removeProperty('--secondary')
        root.style.removeProperty('--secondary-foreground')
      }

      if (themeConfig.backgroundColor && resolvedTheme !== 'dark') {
        root.style.setProperty('--background', themeConfig.backgroundColor)
      } else {
        root.style.removeProperty('--background')
      }

      if (themeConfig.fontFamily) {
        root.style.setProperty('--font-family', `"${themeConfig.fontFamily}", sans-serif`)
      }
    }
  }, [themeConfig, resolvedTheme])

  useEffect(() => {
    if (themeConfig.isPublicRoute) return
    const desired = themeConfig.userTheme?.dark_mode_preference
    if (desired) {
      setTheme(desired)
    }
  }, [setTheme, themeConfig.userTheme?.dark_mode_preference, themeConfig.isPublicRoute])

  // Load dynamic Google Font
  useEffect(() => {
    if (typeof window !== "undefined" && themeConfig.fontFamily) {
      const fontId = 'dynamic-google-font'
      let link = document.getElementById(fontId) as HTMLLinkElement
      if (!link) {
        link = document.createElement('link')
        link.id = fontId
        link.rel = 'stylesheet'
        document.head.appendChild(link)
      }
      const fontName = themeConfig.fontFamily.replace(/\s+/g, '+')
      link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@300;400;500;600;700&display=swap`
    }
  }, [themeConfig.fontFamily])

  // Update Favicon
  useEffect(() => {
    if (typeof window !== "undefined" && themeConfig.icon) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']")
      if (!link) {
        link = document.createElement('link')
        link.rel = 'shortcut icon'
        document.getElementsByTagName('head')[0].appendChild(link)
      }
      link.href = themeConfig.icon
    }
  }, [themeConfig.icon])

  return null
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const themeConfig = useThemeHooks()

  return (
    <BrandingContext.Provider value={themeConfig}>
      <NextThemesProvider {...props}>
        <div style={{ display: 'contents' }}>
          <ThemeEffects themeConfig={themeConfig} />
          {children}
        </div>
      </NextThemesProvider>
    </BrandingContext.Provider>
  )
}
