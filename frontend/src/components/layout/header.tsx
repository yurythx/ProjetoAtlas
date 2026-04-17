"use client"
import { useTheme } from "@/components/theme-provider"
import { User as UserIcon, Settings, LogOut, Plus, FileText, ShieldCheck, UserPlus, LogIn } from "lucide-react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import React from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { usePresence } from "@/hooks/use-presence"
import { useModules } from "@/hooks/use-modules"
import { useAuth } from "@/hooks/use-auth"
import { clearClientSession, ensureHasSessionCookie } from "@/lib/session"
import Image from "next/image"
import { fixImageUrl } from "@/lib/utils"
import { useMobileNavStore } from "@/hooks/use-mobile-nav-store"
import dynamic from "next/dynamic"
import { CRMOfflineAttachmentsIndicator } from "@/features/crm/offline-attachments-indicator"

const MobileNav = dynamic(() => import("@/components/layout/mobile-nav").then((m) => m.MobileNav), {
  ssr: false,
})

const NotificationBell = dynamic(() => import("@/components/layout/notification-bell").then((m) => m.NotificationBell), {
  ssr: false,
  loading: () => <div className="h-10 w-10 rounded-full border bg-muted/20" aria-hidden="true" />,
})


import { HEADER_NAV_ITEMS } from "@/config/navigation"

const guestNavItems: { title: string; href: string; module?: string }[] = [
  { title: "Início", href: "/" },
  { title: "Artigos", href: "/p/artigos", module: "articles" },
]

export function Header() {
  const config = useTheme()
  const { logo, companyName } = config
  const pathname = usePathname()
  const [isClient, setIsClient] = React.useState(false)
  const { userStatuses, updateStatus } = usePresence()
  const { isModuleActive } = useModules()
  const isMobileNavOpen = useMobileNavStore((s) => s.isMobileNavOpen)

  React.useEffect(() => {
    setIsClient(true)
    ensureHasSessionCookie()
  }, [])

  const { user: me, isLoading: authLoading } = useAuth()

  const onLogout = () => {
    clearClientSession()
    window.location.href = "/"
  }


  if (!isClient) {
    return <header className="h-20 border-b bg-background/50 animate-pulse" />
  }

  const isDashboardArea = Boolean(pathname) && (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/artigos') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/crm') ||
    pathname.startsWith('/cms') ||
    pathname.startsWith('/finance') ||
    pathname.startsWith('/insights') ||
    pathname.startsWith('/licensing') ||
    pathname.startsWith('/messenger') ||
    pathname.startsWith('/notificacoes') ||
    pathname.startsWith('/perfil') ||
    pathname.startsWith('/settings')
  )
  const hasDesktopSidebar = Boolean(me && isDashboardArea)
  const showDesktopNav = (!isDashboardArea && !me) || (Boolean(me) && !hasDesktopSidebar)
  const showGuestAuthCta = !isDashboardArea

  return (
    <header className="h-20 sticky top-0 z-50 px-4 sm:px-6 lg:px-8 flex items-center justify-between border-b glass shadow-sm transition-all duration-500" role="banner" aria-label="Cabeçalho">
      <div className="flex items-center gap-4 sm:gap-12 min-w-0">
        <div className="flex items-center gap-4 sm:gap-12 min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-3 group",
              me && isMobileNavOpen && "hidden"
            )}
            aria-label="Ir para a página inicial"
          >
            {me ? (
              <div className="h-10 w-10 relative flex items-center justify-center overflow-hidden rounded-xl bg-primary/10 shadow-inner">
                {logo ? (
                  <Image
                    src={fixImageUrl(logo) || ""}
                    alt={companyName || "Logo"}
                    width={28}
                    height={28}
                    priority
                    className="object-contain transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-primary to-blue-400 rotate-12 shadow-[0_0_15px_rgba(var(--primary),0.3)] flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-white/40 animate-pulse" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-10 w-10 relative flex items-center justify-center overflow-hidden rounded-xl bg-primary/10 shadow-inner">
                <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-primary to-blue-400 rotate-12 shadow-[0_0_15px_rgba(var(--primary),0.3)] flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white/40 animate-pulse" />
                  </div>
                </div>
              </div>
            )}
            {me && (
              <span className="hidden sm:inline text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 max-w-[180px] sm:max-w-[240px] truncate">
                {companyName}
              </span>
            )}
          </Link>
        </div>
        {/* Desktop Navigation */}
        {showDesktopNav ? (
          <nav className="hidden md:flex items-center gap-1" role="navigation" aria-label="Navegação do cabeçalho">
            {(me ? HEADER_NAV_ITEMS : guestNavItems)
              .filter((item) => !("module" in item) || isModuleActive(item.module as string))
              .map((item, index) => (
                <div
                  key={item.href}
                  className="animate-in fade-in slide-in-from-bottom-1 duration-300"
                  style={{ animationDelay: `${(0.08 + index * 0.03).toFixed(2)}s` }}
                >
                  <Button
                    variant="ghost"
                    asChild
                    className={cn(
                      "px-4 font-medium transition-all relative group h-14 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      pathname === item.href ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Link
                      href={item.href}
                      aria-current={
                        pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href)) ? "page" : undefined
                      }
                    >
                      {item.title}
                      {(pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href))) && (
                        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                      )}
                    </Link>
                  </Button>
                </div>
              ))}
          </nav>
        ) : null}
        
      </div>


      <div className="flex items-center gap-2 sm:gap-4 animate-in fade-in duration-300">
        {/* Mobile Navigation Trigger */}
        <div className="md:hidden">
          <MobileNav />
        </div>

        {/* Theme Toggle Premium */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        {/* Quick Action Menu */}
        {me && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="hidden lg:flex rounded-xl font-bold bg-primary/5 hover:bg-primary/10 border-primary/20 transition-all gap-2 group h-10 px-4">
                <Plus className="h-4 w-4 text-primary transition-transform group-hover:rotate-90" aria-hidden="true" />
                Ação Rápida
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2 bg-popover shadow-xl border p-1.5 translate-y-2">
              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 py-2">
                Atalhos de Criação
              </DropdownMenuLabel>
              <DropdownMenuItem asChild className="rounded-xl focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer p-2.5">
                <Link href="/artigos/novo" className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-orange-500" aria-hidden="true" />
                  </div>
                  <span>Novo Artigo</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-xl focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer p-2.5">
                <Link href="/cms?action=create" className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <ShieldCheck className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  </div>
                  <span>Nova Página</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-xl focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer p-2.5">
                <Link href="/crm" className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-indigo-500" aria-hidden="true" />
                  </div>
                  <span>Novo Card / Suporte</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-xl focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer p-2.5">
                <Link href="/admin/users?create=1" className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  </div>
                  <span>Novo Usuário</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Global Notifications Bell */}
        {me && <NotificationBell />}
        {me && <CRMOfflineAttachmentsIndicator />}

        {authLoading && isDashboardArea ? (
          <div className="h-10 w-10 rounded-full border bg-muted/20" aria-hidden="true" />
        ) : me ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full h-10 w-10 border bg-muted/30 hover:bg-muted/50 transition-all shadow-sm p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label="Abrir menu do usuário">
                {me?.avatar ? (
                  <div className="relative h-full w-full">
                    <Image src={fixImageUrl(me.avatar) || ""} alt="Avatar" fill className="object-cover rounded-full" sizes="40px" />
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background shadow-sm transition-colors",
                        (userStatuses.get(me.id) || me.status) === 'online' ? "bg-green-500" :
                          (userStatuses.get(me.id) || me.status) === 'busy' ? "bg-amber-500" : "bg-slate-400"
                      )}
                    />
                  </div>
                ) : (
                  <div className="relative h-full w-full flex items-center justify-center">
                    <UserIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background shadow-sm transition-colors",
                        (userStatuses.get(me.id) || me.status) === 'online' ? "bg-green-500" :
                          (userStatuses.get(me.id) || me.status) === 'busy' ? "bg-amber-500" : "bg-slate-400"
                      )}
                    />
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mt-2 bg-popover shadow-xl border p-1">
              <DropdownMenuLabel className="font-normal px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors rounded-sm group">
                <Link href="/perfil" className="flex flex-col space-y-1">
                  <span className="text-sm font-medium leading-none group-hover:text-primary transition-colors">{me?.first_name || me?.username || 'Usuário'}</span>
                  <span className="text-xs leading-none text-muted-foreground">{me?.email || ''}</span>
                </Link>
              </DropdownMenuLabel>

              <DropdownMenuSeparator className="bg-muted/50 mx-1" />

              <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 py-2 pb-1">
                Seu Status
              </DropdownMenuLabel>
              <div className="flex flex-col gap-0.5 px-1 pb-1">
                <DropdownMenuItem
                  onClick={() => updateStatus('online')}
                  className={cn(
                    "flex items-center gap-2 rounded-md cursor-pointer py-2",
                    (userStatuses.get(me.id) || me.status) === 'online' && "bg-primary/10 text-primary font-bold shadow-sm"
                  )}
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                  <span>Online</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatus('busy')}
                  className={cn(
                    "flex items-center gap-2 rounded-md cursor-pointer py-2",
                    (userStatuses.get(me.id) || me.status) === 'busy' && "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold shadow-sm"
                  )}
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                  <span>Ocupado</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updateStatus('offline')}
                  className={cn(
                    "flex items-center gap-2 rounded-md cursor-pointer py-2",
                    (userStatuses.get(me.id) || me.status) === 'offline' && "bg-muted text-muted-foreground font-bold shadow-sm"
                  )}
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  <span>Offline</span>
                </DropdownMenuItem>
              </div>

              <DropdownMenuSeparator className="bg-muted/50 mx-1" />

              <DropdownMenuItem asChild className="cursor-pointer rounded-md focus:bg-primary/5 focus:text-primary transition-colors">
                <Link href="/perfil" className="flex items-center gap-2 w-full">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  Configurações do Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive flex items-center gap-2 cursor-pointer rounded-md focus:bg-destructive/5 transition-colors">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          showGuestAuthCta ? (
            <Button variant="ghost" size="icon" className="rounded-full" asChild>
              <Link href="/login" title="Acessar Sistema">
                <LogIn className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">Acessar Sistema</span>
              </Link>
            </Button>
          ) : null
        )}
      </div>
    </header>
  )
}
