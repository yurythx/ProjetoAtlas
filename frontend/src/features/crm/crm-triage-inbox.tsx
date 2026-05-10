import { Deal, useCRM, getPipelineColumns } from "./use-crm"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Inbox, Sparkles, ArrowRight, Clock } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export function CRMTriageInbox() {
  const { deals, updateDeal, pipelines } = useCRM()
  
  // No ITIL Version 5, triagem foca em itens sem coluna ativa ou marcados como 'backlog' sem dono
  const triageDeals = deals.filter(d => 
    !d.column && !d.tecnico_responsavel && !d.is_closed
  )

  const handleAIClassify = async (deal: Deal) => {
    if (pipelines.length === 0) return

    // Simulação de Inteligência ITIL Version 5
    // Em produção, isso chamaria um endpoint de IA real
    const currentPipeline = pipelines.find(p => 
      (Array.isArray(p.stages) && p.stages.some(s => s.id === deal.stage)) || 
      p.columns?.some(c => c.id === deal.column)
    ) || pipelines[0]

    const columns = getPipelineColumns(currentPipeline)
    
    // Regras de Ouro Atlas AI:
    // 1. Incidentes -> Geralmente Operação/Suporte
    // 2. Requisições -> Geralmente Entrega/Onboarding
    // 3. Problemas -> Geralmente Design/Construção
    let targetColumn = columns.find(c => c.column_kind === 'active') || columns[1]

    if (deal.record_type === 'incident') {
      targetColumn = columns.find(c => c.column_kind === 'support' || c.column_kind === 'operate') || targetColumn
    } else if (deal.record_type === 'service_request') {
      targetColumn = columns.find(c => c.column_kind === 'deliver' || c.column_kind === 'onboarding') || targetColumn
    }

    try {
      await updateDeal.mutateAsync({
        id: deal.id,
        column: targetColumn.id,
        // Ao classificar, a IA também sugere uma nota técnica
        ai_metadata: {
          insight: `Classificado automaticamente como ${deal.record_type} baseado em análise de linguagem natural.`,
          suggested_actions: ["Validar ICs afetados", "Atribuir técnico N2"]
        }
      })
      toast.success(`Card "${deal.title}" encaminhado para ${targetColumn.title} via Atlas AI.`, {
        icon: <Sparkles className="h-4 w-4 text-violet-500" />
      })
    } catch (error) {
      toast.error("Falha na classificação automática.")
    }
  }

  if (triageDeals.length === 0) return null

  return (
    <div className="mb-8 overflow-hidden rounded-3xl border bg-gradient-to-br from-violet-500/5 via-primary/5 to-transparent p-1 shadow-2xl shadow-primary/5">
      <div className="bg-card/50 backdrop-blur-xl rounded-[22px] p-6 border border-white/10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
              <Inbox className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight uppercase">Centro de Triagem</h3>
                <Badge className="bg-primary text-primary-foreground animate-pulse">
                  {triageDeals.length} Novos
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground font-medium">Itens aguardando classificação e Fluxo de Valor.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-violet-500/10 px-4 py-2 rounded-2xl border border-violet-500/20">
            <Sparkles className="h-4 w-4 text-violet-600 animate-bounce" />
            <span className="text-xs font-bold text-violet-700 uppercase tracking-tighter">
              IA Sugere: Automatizar 40% desta fila
            </span>
          </div>
        </div>

        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex gap-4">
            <AnimatePresence mode="popLayout">
              {triageDeals.map((deal) => (
                <motion.div
                  key={deal.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="w-[300px] shrink-0 group"
                >
                  <div className="bg-card border-2 border-primary/5 hover:border-primary/20 rounded-2xl p-4 transition-all hover:shadow-xl hover:shadow-primary/5 cursor-pointer relative overflow-hidden group">
                     {/* Overlay de Prioridade IA */}
                     <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon-xs" variant="secondary" className="rounded-full shadow-lg">
                           <Sparkles className="h-3 w-3 text-violet-600" />
                        </Button>
                     </div>

                     <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest">
                           <Clock className="h-3 w-3" />
                           Recebido agora
                        </div>
                        <h4 className="text-sm font-bold leading-tight line-clamp-2 min-h-[40px]">
                           {deal.title}
                        </h4>
                        
                        <div className="flex items-center justify-between gap-2 pt-2">
                           <div className="flex -space-x-2">
                              {/* Avatar placeholder do solicitante */}
                              <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[8px] font-bold">
                                 {deal.contact_name?.[0]}
                              </div>
                           </div>
                           <Button 
                             size="sm" 
                             className="h-8 rounded-xl font-bold text-[10px] uppercase gap-2 bg-primary/90 hover:bg-primary transition-all active:scale-95 disabled:opacity-50"
                             onClick={() => handleAIClassify(deal)}
                             disabled={updateDeal.isPending}
                           >
                             {updateDeal.isPending ? (
                               <span className="animate-spin mr-1 text-xs">🌀</span>
                             ) : (
                               <>Classificar <ArrowRight className="h-3 w-3" /></>
                             )}
                           </Button>
                        </div>
                     </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
