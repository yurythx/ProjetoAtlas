"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, LogOut, User, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, fixImageUrl } from "@/lib/utils"
import { useModules } from "@/hooks/use-modules"
import { useTheme } from "@/components/theme-provider"
import { useAuth } from "@/hooks/use-auth"
import { usePermission } from "@/hooks/use-permission"
import { api } from "@/lib/axios"
import { clearClientSession } from "@/lib/session"
import Image from "next/image"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import { SIDEBAR_CONFIG, HEADER_NAV_ITEMS } from "@/config/navigation"

export function MobileNav() {
  const [mounted, setMounted] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)
  const pathname = usePathname()
  const { isModuleActive } = useModules()
  const { logo, companyName } = useTheme()
  const { user } = useAuth()
  const { hasPermission } = usePermission()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const navItems = user 
    ? SIDEBAR_CONFIG.flatMap(section => section.items)
    : HEADER_NAV_ITEMS

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        await api.post('/api/accounts/logout/', { refresh: refreshToken })
      }
    } catch {
      // Procedemos mesmo se falhar
    } finally {
      clearClientSession()
      window.location.href = "/"
    }
  }

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="rounded-xl">
        <Menu className="h-6 w-6" />
      </Button>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm border-0 bg-background/80 backdrop-blur-2xl p-0 flex flex-col shadow-2xl">
        <SheetHeader className="p-8 border-b border-primary/5 text-left">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center relative bg-primary/10 rounded-xl">
               {logo ? (
                 <Image src={fixImageUrl(logo)} alt={companyName || "Logo"} width={28} height={28} className="object-contain" />
               ) : (
                 <div className="w-5 h-5 rounded-lg bg-gradient-to-tr from-primary to-blue-400 rotate-12" />
               )}
            </div>
            <SheetTitle className="text-2xl font-black tracking-tighter uppercase">
              {companyName || "ATLAS"}
            </SheetTitle>
          </div>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto p-6 space-y-2" role="navigation" aria-label="Navegação móvel">
          {navItems.map((item) => {
            if (item.module && !isModuleActive(item.module)) return null
            if (item.requireSuperuser && !user?.is_superuser) return null
            if (item.permission && !hasPermission(item.permission)) return null

            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center justify-between p-4 rounded-2xl font-black text-xs tracking-[0.15em] uppercase transition-all duration-300",
                  isActive 
                    ? "bg-primary text-white shadow-lg shadow-primary/25 scale-[1.02]" 
                    : "hover:bg-primary/5 text-muted-foreground/80 hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-4">
                  <Icon className={cn("h-5 w-5", isActive ? "text-white" : "text-primary/60")} />
                  {item.title}
                </div>
                <ChevronRight className={cn("h-4 w-4 opacity-50", isActive && "opacity-100")} />
              </Link>
            )
          })}
        </nav>

        <div className="p-6 mt-auto space-y-4 border-t border-primary/5">
           <div className="flex items-center justify-between p-4 rounded-2xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-3">
                 <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                 </div>
                 <div className="flex flex-col">
                    <span className="text-sm font-black tracking-tight truncate max-w-[120px]">
                      {user?.first_name || user?.username || 'Usuário'}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Logado</span>
                 </div>
              </div>
              <ThemeToggle />
           </div>

           <Button
             variant="outline"
             className="w-full h-14 rounded-2xl font-black uppercase tracking-[0.2em] text-destructive border-destructive/20 hover:bg-destructive/5"
             onClick={handleLogout}
             disabled={isLoggingOut}
           >
             <LogOut className="h-5 w-5 mr-3" />
             {isLoggingOut ? 'Saindo...' : 'Sair'}
           </Button>
           
           <p className="text-center text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.3em] pb-2">
             ITIL Version 5 Architecture
           </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
