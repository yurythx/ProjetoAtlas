"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { BarChart3, Menu, X, LayoutDashboard, MessageSquare, FileText, Settings, ShieldCheck, Box, LogOut, User, DollarSign, Calendar, Headset } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useModules } from "@/hooks/use-modules"
import { useTheme } from "@/components/theme-provider"
import { useAuth } from "@/hooks/use-auth"
import { usePermission } from "@/hooks/use-permission"
import { api } from "@/lib/axios"
import { clearClientSession, ensureHasSessionCookie } from "@/lib/session"
import Image from "next/image"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { useMobileNavStore } from "@/hooks/use-mobile-nav-store"

import { SIDEBAR_CONFIG } from "@/config/navigation"

const navItems = SIDEBAR_CONFIG.flatMap(section => section.items)

export function MobileNav() {
    const [isOpen, setIsOpen] = React.useState(false)
    const [isLoggingOut, setIsLoggingOut] = React.useState(false)
    const setMobileNavOpen = useMobileNavStore((s) => s.setMobileNavOpen)
    const pathname = usePathname()
    const { isModuleActive } = useModules()
    const { logo, companyName } = useTheme()
    const { user } = useAuth()
    const { hasPermission } = usePermission()

    React.useEffect(() => {
        ensureHasSessionCookie()
    }, [])

    const handleLogout = async () => {
        setIsLoggingOut(true)
        setIsOpen(false)
        setMobileNavOpen(false)
        try {
            const refreshToken = localStorage.getItem('refreshToken')
            if (refreshToken) {
                await api.post('/api/accounts/logout/', { refresh: refreshToken })
            }
        } catch {
            // Logout is best-effort — proceed even if server call fails
        } finally {
            clearClientSession()
            window.location.href = "/"
        }
    }

    // Close menu when route changes
    React.useEffect(() => {
        setIsOpen(false)
        setMobileNavOpen(false)
    }, [pathname, setMobileNavOpen])

    // Prevent body scroll when menu is open
    React.useEffect(() => {
        if (typeof window === "undefined") return
        if (isOpen) document.body.style.overflow = "hidden"
        setMobileNavOpen(isOpen)
        return () => {
            document.body.style.overflow = ""
            setMobileNavOpen(false)
        }
    }, [isOpen, setMobileNavOpen])

    return (
        <div className="md:hidden">
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(true)}
                className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label="Abrir menu"
            >
                <Menu className="h-6 w-6" aria-hidden="true" />
                <span className="sr-only">Abrir menu</span>
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                            aria-hidden="true"
                            role="presentation"
                        />

                        {/* Content */}
                        <motion.div
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-background border-r z-[101] shadow-2xl flex flex-col p-4 pb-[env(safe-area-inset-bottom)]"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center relative">
                                        {logo ? (
                                            <Image src={logo} alt={companyName || "Logo"} width={32} height={32} className="object-contain" />
                                        ) : (
                                            <div className="h-full w-full rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden ring-1 ring-border">
                                                <img src={fixImageUrl(config.logo) || "/logo.svg"} alt={config.companyName || "Atlas"} className="object-cover w-full h-full p-1.5" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = `<span class="text-xl">${(config.companyName || "A")[0]}</span>`; }} />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-lg font-bold tracking-tight truncate max-w-[150px]">
                                        {companyName || "Atlas"}
                                    </span>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Fechar menu" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                                    <X className="h-5 w-5" aria-hidden="true" />
                                </Button>
                            </div>

                            <nav className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-2 -mr-2" role="navigation" aria-label="Navegação móvel">
                                {navItems.map((item) => {
                                    if (item.module && !isModuleActive(item.module)) {
                                        return null
                                    }
                                    if (item.requireSuperuser && !user?.is_superuser) {
                                        return null
                                    }
                                    if (item.permission && !hasPermission(item.permission)) {
                                        return null
                                    }

                                    const Icon = item.icon
                                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            aria-current={isActive ? "page" : undefined}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-xl text-base font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                                                isActive
                                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                                    : "text-foreground bg-muted/30 hover:bg-muted/60 border border-border/60"
                                            )}
                                        >
                                            <Icon className="h-5 w-5" aria-hidden="true" />
                                            {item.title}
                                        </Link>
                                    )
                                })}
                            </nav>

                            <div className="mt-auto space-y-4">
                                <div className="p-4 rounded-xl bg-muted/50 border flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                        <User className="h-5 w-5" aria-hidden="true" />
                                    </div>
                                    <div className="flex-1 overflow-hidden">
                                        <p className="text-sm font-bold truncate">
                                            {user?.first_name && user?.last_name
                                                ? `${user.first_name} ${user.last_name}`
                                                : user?.username || 'Usuário'}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">{user?.email || ''}</p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border">
                                    <span className="text-sm font-semibold">Tema</span>
                                    <ThemeToggle />
                                </div>

                                <Button
                                    variant="outline"
                                    className="w-full justify-start gap-3 rounded-xl h-12 text-destructive border-destructive/20 hover:bg-destructive/5"
                                    onClick={handleLogout}
                                    disabled={isLoggingOut}
                                    aria-label="Sair da conta"
                                >
                                    <LogOut className="h-5 w-5" aria-hidden="true" />
                                    {isLoggingOut ? 'Saindo...' : 'Sair da Conta'}
                                </Button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}
