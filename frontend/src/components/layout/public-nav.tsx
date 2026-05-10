"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface PublicNavProps {
  hasSession: boolean
}

export function PublicNav({ hasSession }: PublicNavProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const pathname = usePathname()

  const navItems = [
    { label: "Serviços", href: "/p/ecossistema-de-servicos" },
    { label: "Sobre", href: "/p/sobre" },
    { label: "Artigos", href: hasSession ? "/artigos" : "/p/artigos" },
  ]

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-2" aria-label="Ações">
        {navItems.map((item) => (
          <Button key={item.href} asChild variant="ghost" className="rounded-xl font-bold">
            <Link href={item.href}>{item.label}</Link>
          </Button>
        ))}
        <div className="w-px h-6 bg-border mx-2" />
        <ThemeToggle />
        {!hasSession && (
          <Button asChild variant="default" className="rounded-xl px-6 font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform">
            <Link href="/login">ENTRAR</Link>
          </Button>
        )}
      </nav>

      {/* Mobile Navigation */}
      <div className="flex md:hidden items-center gap-4">
        <ThemeToggle />
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-xl">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] border-0 glass p-0">
            <SheetHeader className="p-8 border-b border-primary/5 text-left">
              <SheetTitle className="text-2xl font-black tracking-tighter">ATLAS <span className="text-primary font-normal">MENU</span></SheetTitle>
            </SheetHeader>
            <div className="flex flex-col p-6 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all",
                    pathname === item.href ? "bg-primary text-white" : "hover:bg-primary/5 text-muted-foreground"
                  )}
                >
                  {item.label}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
              
              <div className="h-px bg-border my-4" />
              
              {!hasSession ? (
                <Button asChild className="h-14 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20" onClick={() => setIsOpen(false)}>
                  <Link href="/login">ACESSAR PLATAFORMA</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" className="h-14 rounded-2xl font-black uppercase tracking-[0.2em]" onClick={() => setIsOpen(false)}>
                  <Link href="/dashboard">VOLTAR AO ATLAS</Link>
                </Button>
              )}
            </div>
            <div className="absolute bottom-8 left-0 right-0 px-8 text-center">
              <p className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.3em]">ITIL Version 5 Architecture</p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
