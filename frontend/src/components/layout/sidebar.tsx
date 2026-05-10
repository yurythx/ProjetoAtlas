"use client"

import { useUIStore } from "@/hooks/use-ui-store"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn, fixImageUrl } from "@/lib/utils"
import { useModules } from "@/hooks/use-modules"
import { useAuth } from "@/hooks/use-auth"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { useTheme } from "@/components/theme-provider"
import { useEffect, useState } from "react"
import { ChevronRight } from "lucide-react"
import { motion } from "framer-motion"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { SIDEBAR_CONFIG } from "@/config/navigation"

export function Sidebar() {
  const pathname = usePathname()
  const { isModuleActive } = useModules()
  const { isSidebarCollapsed, toggleSidebar } = useUIStore()
  const { user: me } = useAuth()
  const config = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const userPermissions = me?.role_details?.permissions || []
  const isSuperuser = me?.is_superuser

  const hasPermission = (permission: string) => {
    if (isSuperuser) return true
    if (userPermissions.includes("*")) return true
    return userPermissions.includes(permission)
  }

  const canModerateComments = hasPermission("articles.comment_moderate") && isModuleActive("articles")
  const canModerateArticles =
    hasPermission("articles.article_publish") && hasPermission("articles.article_view") && isModuleActive("articles")
  const canReadModerationMetrics =
    isModuleActive("articles") &&
    (hasPermission("articles.article_view") ||
      hasPermission("articles.comment_moderate") ||
      hasPermission("articles.article_publish"))

  const moderationMetricsQuery = useQuery({
    queryKey: ["articles-moderation-metrics"],
    queryFn: async ({ signal }) => {
      const res = await api.get<{
        pending_articles?: number
        pending_comments?: number
        pending_replies?: number
        pending_total?: number
      }>("/api/articles/articles/moderation_metrics/", { signal })
      return res.data
    },
    enabled: !!me && canReadModerationMetrics,
    refetchInterval: 30000,
  })

  const pendingArticlesCount =
    canModerateArticles ? (moderationMetricsQuery.data?.pending_articles ?? 0) : 0
  const pendingCount =
    canModerateComments ? (moderationMetricsQuery.data?.pending_total ?? 0) : 0

  // Filter sections based on permissions
  const filteredSections = SIDEBAR_CONFIG.map(section => {
    const filteredItems = section.items.filter(item => {
      // 1. Module check
      if (item.module && !isModuleActive(item.module)) return false

      // 2. Superuser check
      if (item.requireSuperuser && !isSuperuser) return false

      // 3. Permission check (Generic)
      if (item.permission && !hasPermission(item.permission)) return false

      // 4. Specific route overrides (Legacy/Hardcoded)
      if (item.href.startsWith('/admin') && !hasPermission('admin.view_dashboard')) return false

      return true
    })

    return { ...section, items: filteredItems }
  }).filter(section => section.items.length > 0)

  return (
    <aside
      className={cn(
        "border-r fixed left-0 top-20 hidden md:flex flex-col transition-all duration-500 z-40 bg-background/60 backdrop-blur-2xl h-[calc(100vh-5rem)] shadow-[4px_0_24px_rgba(0,0,0,0.02)]",
        isSidebarCollapsed ? "w-20" : "w-72"
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className={cn(
          "absolute -right-3 top-6 bg-background border rounded-full p-1.5 shadow-md z-30 transition-transform duration-300 hover:bg-muted hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          !isSidebarCollapsed && "rotate-180"
        )}
        aria-label="Alternar barra lateral"
        aria-expanded={!isSidebarCollapsed}
      >
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </button>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-4 overflow-y-auto scrollbar-none hover:scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent transition-all" role="navigation" aria-label="Navegação principal">
        <TooltipProvider delayDuration={0}>
          {filteredSections.map((section, sectionIndex) => (
            <div
              key={sectionIndex}
              className="space-y-2"
              role="group"
              aria-labelledby={!isSidebarCollapsed && section.title ? `sidebar-section-${sectionIndex}-title` : undefined}
            >
              {!isSidebarCollapsed && section.title && (
                <h4
                  id={`sidebar-section-${sectionIndex}-title`}
                  className="px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground/70 mb-2 animate-in fade-in slide-in-from-left-2 duration-300"
                >
                  {section.title}
                </h4>
              )}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold tracking-tight transition-all duration-300 group relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                            isActive
                              ? "text-primary bg-primary/5 border border-primary/10 shadow-sm"
                              : "text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground",
                            isSidebarCollapsed && "justify-center px-2"
                          )}
                          aria-current={isActive ? "page" : undefined}
                          aria-label={isSidebarCollapsed ? item.title : undefined}
                        >
                          <Icon className={cn(
                            "h-5 w-5 transition-transform duration-300 group-hover:scale-110",
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                          )} aria-hidden="true" />

                          {!isSidebarCollapsed && (
                            <span className="relative z-10 transition-all duration-300">{item.title}</span>
                          )}

                          {item.href === "/artigos/comentarios" && pendingCount > 0 && (
                            <span
                              className={cn(
                                "ml-auto text-[10px] font-bold tabular-nums rounded-full px-2 py-0.5",
                                isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                              )}
                              aria-label={`${pendingCount} comentários pendentes`}
                            >
                              {pendingCount}
                            </span>
                          )}

                          {item.href === "/artigos" && pendingArticlesCount > 0 && (
                            <span
                              className={cn(
                                "ml-auto text-[10px] font-bold tabular-nums rounded-full px-2 py-0.5",
                                isActive ? "bg-amber-500 text-white" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              )}
                              aria-label={`${pendingArticlesCount} artigos pendentes`}
                            >
                              {pendingArticlesCount}
                            </span>
                          )}

                          {isActive && (
                            <motion.div
                              layoutId="sidebar-active-glow"
                              className="absolute left-0 top-2 bottom-2 w-1.5 bg-primary rounded-full shadow-[0_0_12px_rgba(var(--primary),0.6)]"
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            />
                          )}
                        </Link>
                      </TooltipTrigger>
                      {isSidebarCollapsed && (
                        <TooltipContent side="right" className="font-semibold glass border-none shadow-xl text-foreground">
                          {item.title}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border/50 bg-background/20">
        {!isSidebarCollapsed ? (
          <div className="bg-gradient-to-br from-primary/10 to-transparent rounded-2xl p-4 border border-primary/10 shadow-sm group hover:border-primary/20 transition-all cursor-default">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center relative overflow-hidden ring-1 ring-border">
                {mounted && (
                  <img src={fixImageUrl(config.logo) || "/logo.svg"} alt={config.companyName || "Atlas"} className="object-cover w-full h-full p-1" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = `<span class="text-xs font-bold text-primary">${(config.companyName || "Atlas").substring(0, 2).toUpperCase()}</span>`; }} />
                )}
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Atlas ITIL Version 5</p>
                <p className="text-[10px] text-muted-foreground">v1.0.0 Stable</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center relative overflow-hidden ring-1 ring-border cursor-help" title="Atlas v1.0">
               {mounted && (
                 <img src={fixImageUrl(config.logo) || "/logo.svg"} alt={config.companyName || "Atlas"} className="object-cover w-full h-full p-1" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-[10px] font-bold text-primary">AT</span>'; }} />
               )}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
