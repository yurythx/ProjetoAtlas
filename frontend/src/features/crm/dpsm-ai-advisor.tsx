import React, { useState } from "react"
import { useDPSMRecommendations } from "./use-crm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sparkles, AlertCircle, TrendingUp, ArrowRight, X } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Card } from "@/components/ui/card"

export function DPSMAIAdvisor() {
  const { data: recs, isLoading } = useDPSMRecommendations()
  const [isOpen, setIsOpen] = useState(false)

  if (isLoading || !recs) return null

  const total = recs.vulnerabilities.length + recs.opportunities.length
  if (total === 0) return null

  return (
    <div className="relative">
      <Button 
        onClick={() => setIsOpen(!isOpen)}
        variant="outline" 
        className="gap-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all shadow-sm"
      >
        <Sparkles className="h-4 w-4 text-primary animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider">IA Insights</span>
        <Badge className="h-5 w-5 p-0 flex items-center justify-center bg-primary text-primary-foreground">{total}</Badge>
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute top-12 right-0 z-50 w-[380px] origin-top-right whitespace-normal"
          >
            <Card className="border shadow-2xl p-0 overflow-hidden glass-card">
              <div className="p-4 border-b bg-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-bold text-sm uppercase tracking-tight">Conselheiro DPSM (IA)</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-2 space-y-4 max-h-[500px] overflow-y-auto">
                {recs.vulnerabilities.length > 0 && (
                  <div className="space-y-2">
                     <p className="px-2 text-[10px] font-black text-rose-600 uppercase tracking-[0.2em]">Vulnerabilidades de Fluxo</p>
                     {recs.vulnerabilities.map((v, i) => (
                       <div key={i} className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 space-y-2">
                         <div className="flex items-start gap-2">
                           <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                           <p className="text-sm font-bold leading-tight">{v.title}</p>
                         </div>
                         <p className="text-xs text-muted-foreground">{v.reason}</p>
                         <div className="pt-1 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-rose-600 uppercase">Ação: {v.action}</span>
                            <ArrowRight className="h-3 w-3 text-rose-400" />
                         </div>
                       </div>
                     ))}
                  </div>
                )}

                {recs.opportunities.length > 0 && (
                  <div className="space-y-2">
                     <p className="px-2 text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Oportunidades de Valor</p>
                     {recs.opportunities.map((o, i) => (
                       <div key={i} className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                         <div className="flex items-start gap-2">
                           <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                           <p className="text-sm font-bold leading-tight">{o.title}</p>
                         </div>
                         <p className="text-xs text-muted-foreground">{o.reason}</p>
                         <div className="pt-1 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase">Ação: {o.action}</span>
                            <ArrowRight className="h-3 w-3 text-emerald-400" />
                         </div>
                       </div>
                     ))}
                  </div>
                )}
              </div>
              
              <div className="p-3 bg-muted/30 border-t">
                 <p className="text-[9px] text-center text-muted-foreground italic">
                    Sugestões baseadas no histórico de Fluxo de Valor (Tail Value) e métricas XLA.
                 </p>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
