"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  Zap,
  MessageSquare,
  Calendar,
  DollarSign,
  BookOpen,
  Settings,
  User,
  Activity,
  Plus,
  Layers,
  ArrowRight,
  ShieldCheck,
  Target
} from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

interface CommandAction {
  id: string
  title: string
  description: string
  icon: React.ElementType
  category: string
  href?: string
  action?: () => void
  shortcut?: string[]
}

const COMMANDS: CommandAction[] = [
  // Módulos
  { id: "nav-crm", title: "CRM / Pipelines", description: "Gestão de oportunidades e fluxo de valor", icon: Target, category: "Módulos", href: "/crm" },
  { id: "nav-itil", title: "ITIL v5 Hub", description: "Governança e framework de alta performance", icon: ShieldCheck, category: "Módulos", href: "/itil-version-5" },
  { id: "nav-messenger", title: "Messenger", description: "Protocolos de comunicação e chat", icon: MessageSquare, category: "Módulos", href: "/messenger" },
  { id: "nav-calendar", title: "Calendário", description: "Sincronização de SLAs e eventos", icon: Calendar, category: "Módulos", href: "/calendar" },
  { id: "nav-finance", title: "Financeiro", description: "Controle de recebíveis e despesas", icon: DollarSign, category: "Módulos", href: "/financeiro" },
  { id: "nav-articles", title: "KEDB / Artigos", description: "Base de conhecimento e erros conhecidos", icon: BookOpen, category: "Módulos", href: "/articles" },
  
  // Ações Rápidas
  { id: "action-deal", title: "Nova Oportunidade", description: "Criar um novo card no CRM", icon: Plus, category: "Ações Rápidas", shortcut: ["N"] },
  { id: "action-swarm", title: "Iniciar Swarm", description: "Ativar War Room colaborativa", icon: Zap, category: "Ações Rápidas", shortcut: ["S"] },
  { id: "action-analytics", title: "Ver Analytics", description: "Dashboard executivo e VSM", icon: Activity, category: "Ações Rápidas", href: "/crm/analytics" },
  
  // Configurações
  { id: "nav-settings", title: "Configurações", description: "Preferências e gestão de sistema", icon: Settings, category: "Sistema", href: "/settings" },
  { id: "nav-profile", title: "Meu Perfil", description: "Identidade e credenciais", icon: User, category: "Sistema", href: "/profile" },
]

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const filteredCommands = React.useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return COMMANDS
    return COMMANDS.filter(cmd => 
      cmd.title.toLowerCase().includes(q) || 
      cmd.description.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q)
    )
  }, [query])

  React.useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const onSelect = (cmd: CommandAction) => {
    if (cmd.href) {
      router.push(cmd.href)
    } else if (cmd.action) {
      cmd.action()
    }
    setOpen(false)
    setQuery("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex(prev => (prev + 1) % filteredCommands.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length)
    } else if (e.key === "Enter") {
      if (filteredCommands[activeIndex]) {
        onSelect(filteredCommands[activeIndex])
      }
    }
  }

  const categories = Array.from(new Set(filteredCommands.map(c => c.category)))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl p-0 border-none bg-transparent shadow-none overflow-visible top-[20%] translate-y-0">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-slate-950/80 backdrop-blur-3xl shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)]"
        >
          {/* Glowing Header Accents */}
          <div className="absolute top-0 left-1/4 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_50%)] pointer-events-none" />

          {/* Search Input Area */}
          <div className="flex items-center px-8 h-24 border-b border-white/5 relative z-10">
            <Search className="h-6 w-6 text-primary animate-pulse mr-6 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="O que você deseja orquestrar hoje?"
              className="flex-1 bg-transparent border-none focus:outline-none text-xl font-black tracking-tight text-white placeholder:text-slate-600 uppercase"
            />
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/5 shrink-0">
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">ESC</span>
            </div>
          </div>

          {/* Results Area */}
          <div className="max-h-[500px] overflow-y-auto p-4 custom-scrollbar relative z-10">
            {filteredCommands.length > 0 ? (
              <div className="space-y-8 p-4">
                {categories.map(category => (
                  <div key={category} className="space-y-4">
                    <div className="flex items-center gap-4 px-4">
                       <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">{category}</h4>
                       <div className="h-[1px] flex-1 bg-white/5" />
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {filteredCommands.filter(c => c.category === category).map((cmd) => {
                        const isSelected = filteredCommands[activeIndex]?.id === cmd.id
                        return (
                          <button
                            key={cmd.id}
                            onClick={() => onSelect(cmd)}
                            onMouseEnter={() => setActiveIndex(filteredCommands.indexOf(cmd))}
                            className={cn(
                              "group flex items-center gap-6 p-5 rounded-3xl transition-all duration-300 text-left relative overflow-hidden",
                              isSelected ? "bg-primary text-white shadow-2xl shadow-primary/40 scale-[1.02]" : "hover:bg-white/5 text-slate-400"
                            )}
                          >
                            <div className={cn(
                              "h-14 w-14 rounded-2xl flex items-center justify-center transition-transform",
                              isSelected ? "bg-white/20" : "bg-white/5 border border-white/5 group-hover:rotate-12"
                            )}>
                              <cmd.icon className={cn("h-6 w-6", isSelected ? "text-white" : "text-primary/60")} />
                            </div>
                            <div className="flex-1 min-w-0">
                               <div className="flex items-center gap-3">
                                  <h3 className={cn("text-lg font-black uppercase tracking-tighter", isSelected ? "text-white" : "text-slate-200")}>
                                    {cmd.title}
                                  </h3>
                                  {cmd.shortcut && (
                                    <div className="flex items-center gap-1 opacity-40">
                                       {cmd.shortcut.map(s => (
                                         <Badge key={s} variant="outline" className="h-5 px-1.5 rounded-md border-white/20 text-[9px] font-black">{s}</Badge>
                                       ))}
                                    </div>
                                  )}
                               </div>
                               <p className={cn("text-[11px] font-bold mt-0.5 line-clamp-1 opacity-60 uppercase tracking-tight", isSelected ? "text-white" : "text-slate-500")}>
                                 {cmd.description}
                               </p>
                            </div>
                            <ArrowRight className={cn(
                              "h-5 w-5 transition-all",
                              isSelected ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                            )} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                 <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center border border-dashed border-white/10 mb-6">
                    <Layers className="h-10 w-10 text-slate-700 opacity-20" />
                 </div>
                 <h3 className="text-xl font-black text-slate-500 uppercase tracking-tighter">Nenhum comando orquestrado</h3>
                 <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest mt-2">Refine sua busca para navegar na malha Atlas</p>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="px-8 py-4 bg-white/5 border-t border-white/5 flex items-center justify-between text-[10px] font-black text-slate-600 uppercase tracking-widest relative z-10">
             <div className="flex items-center gap-6">
                <span className="flex items-center gap-2"><div className="px-2 py-0.5 rounded bg-white/10 text-slate-400">↑↓</div> NAVEGAR</span>
                <span className="flex items-center gap-2"><div className="px-2 py-0.5 rounded bg-white/10 text-slate-400">ENTER</div> EXECUTAR</span>
             </div>
             <div className="flex items-center gap-2 text-primary/40">
                <Zap className="h-3 w-3" />
                <span>Atlas Command v5</span>
             </div>
          </div>
        </motion.div>
      </DialogContent>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </Dialog>
  )
}
