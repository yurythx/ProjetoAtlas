"use client"

import * as React from "react"
import { useState } from "react"
import { 
  Shield, 
  BookOpen, 
  Timer, 
  Heart, 
  Plus, 
  Search,
  Settings2,
  ChevronRight,
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGovernance } from "@/features/crm/use-governance"
import { ModuleGuard } from "@/components/module-guard"

export default function GovernancePage() {
  const { slaPolicies, serviceItems, isLoading } = useGovernance()
  const [searchTerm, setSearchTerm] = useState("")

  return (
    <ModuleGuard moduleCode="crm">
      <div className="max-w-7xl mx-auto py-10 px-4 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
              <Shield className="h-3 w-3" />
              ITIL Version 5 Governance
            </div>
            <h1 className="text-4xl md:text-6xl font-black italic tracking-tighter uppercase leading-none">
              Governança de <span className="text-primary">Serviços</span>
            </h1>
            <p className="text-muted-foreground font-medium max-w-2xl leading-relaxed">
              Gerencie o Catálogo de Serviços, Políticas de SLA e métricas de Experiência (XLA) 
              para garantir a entrega de valor contínuo conforme o framework ITIL v5.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             <Button variant="outline" className="h-12 rounded-xl font-bold uppercase tracking-widest text-[10px]">
                <Settings2 className="mr-2 h-4 w-4" />
                Configurações Globais
             </Button>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-2xl border border-border/50 backdrop-blur-md">
           <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar regras, serviços ou políticas..." 
                className="pl-12 h-12 bg-transparent border-none focus-visible:ring-0 text-sm font-bold"
              />
           </div>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="catalog" className="space-y-8">
          <TabsList className="bg-muted/50 p-1.5 rounded-2xl border border-border/50 h-16 w-full md:w-auto overflow-x-auto scrollbar-none">
            <TabsTrigger value="catalog" className="px-8 rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-lg gap-2">
              <BookOpen className="h-4 w-4" />
              Catálogo de Serviços
            </TabsTrigger>
            <TabsTrigger value="sla" className="px-8 rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-lg gap-2">
              <Timer className="h-4 w-4" />
              Políticas de SLA
            </TabsTrigger>
            <TabsTrigger value="xla" className="px-8 rounded-xl font-black uppercase tracking-widest text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-lg gap-2">
              <Heart className="h-4 w-4" />
              Experiência (XLA)
            </TabsTrigger>
          </TabsList>

          {/* Service Catalog Tab */}
          <TabsContent value="catalog" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <Card className="glass shadow-xl border-primary/5">
                 <CardHeader>
                    <div className="flex items-center justify-between">
                       <CardTitle className="text-lg font-black uppercase italic tracking-tight">Serviços Ativos</CardTitle>
                       <Badge variant="secondary" className="font-bold">{serviceItems.length}</Badge>
                    </div>
                    <CardDescription className="text-xs">Itens disponíveis no catálogo para requisição.</CardDescription>
                 </CardHeader>
               </Card>
               {/* Stat cards placeholder */}
            </div>

            <div className="glass rounded-[2rem] border border-primary/5 overflow-hidden shadow-2xl">
               <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border/50">
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Serviço</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo ITIL</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Custo Est.</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                      <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      [1,2,3].map(i => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={5} className="px-8 py-4 h-12 bg-muted/20" />
                        </tr>
                      ))
                    ) : serviceItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-muted-foreground font-bold">
                          Nenhum item de serviço cadastrado.
                        </td>
                      </tr>
                    ) : serviceItems.map(item => (
                      <tr key={item.id} className="group hover:bg-primary/5 transition-colors border-b border-border/30 last:border-0">
                         <td className="px-8 py-5">
                            <div className="flex flex-col">
                               <span className="font-black text-sm uppercase italic tracking-tight group-hover:text-primary transition-colors">{item.name}</span>
                               <span className="text-[10px] text-muted-foreground font-medium">{item.description || "Sem descrição"}</span>
                            </div>
                         </td>
                         <td className="px-8 py-5">
                            <Badge variant="outline" className="font-bold uppercase text-[9px] tracking-widest">
                               {item.record_type}
                            </Badge>
                         </td>
                         <td className="px-8 py-5 font-bold text-sm">
                            R$ {item.estimated_cost}
                         </td>
                         <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                               <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                               <span className="text-[10px] font-black uppercase tracking-widest">Ativo</span>
                            </div>
                         </td>
                         <td className="px-8 py-5">
                            <Button variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 hover:text-primary">
                               <ChevronRight className="h-4 w-4" />
                            </Button>
                         </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
            </div>

            <Button className="h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs px-10 shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
               <Plus className="mr-2 h-4 w-4" />
               Novo Item de Serviço
            </Button>
          </TabsContent>

          {/* SLA Policies Tab */}
          <TabsContent value="sla" className="space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {slaPolicies.map(policy => (
                  <Card key={policy.id} className="glass group hover:border-primary/50 transition-all duration-500 overflow-hidden relative">
                     <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Timer className="h-20 w-20" />
                     </div>
                     <CardHeader>
                        <CardTitle className="text-xl font-black uppercase italic tracking-tighter">{policy.name}</CardTitle>
                        <CardDescription className="text-xs font-bold text-muted-foreground/80">{policy.description}</CardDescription>
                     </CardHeader>
                     <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
                           <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resposta Alvo</span>
                           <span className="font-bold text-primary">{policy.target_response_minutes} min</span>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border/50">
                           <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Resolução Alvo</span>
                           <span className="font-bold text-primary">{policy.target_resolution_minutes / 60} horas</span>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                           <Info className="h-3 w-3 text-primary" />
                           <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground italic">
                              {policy.business_hours_only ? "Horário Comercial" : "24/7 Full Support"}
                           </span>
                        </div>
                     </CardContent>
                  </Card>
                ))}
                
                <button className="border-2 border-dashed border-primary/20 rounded-[2rem] p-8 flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all group group">
                   <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus className="h-8 w-8 text-primary" />
                   </div>
                   <div className="text-center">
                      <p className="font-black uppercase tracking-widest text-xs">Nova Política</p>
                      <p className="text-[10px] text-muted-foreground font-medium">Definir tempos de atendimento</p>
                   </div>
                </button>
             </div>
          </TabsContent>

          {/* XLA Tab */}
          <TabsContent value="xla" className="space-y-6">
             <div className="max-w-3xl space-y-8">
                <div className="bg-primary/5 rounded-[2rem] p-10 border border-primary/10 space-y-6">
                   <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter">Governance Experience Center</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed font-medium">
                        O XLA (Experience Level Agreement) mede o valor subjetivo da entrega. No Atlas ITIL v5, 
                        você configura as dimensões de sucesso que o usuário avaliará.
                      </p>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between p-6 rounded-2xl glass border-primary/10">
                         <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                               <Heart className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div>
                               <p className="text-xs font-black uppercase tracking-tight">Outcome Satisfaction</p>
                               <p className="text-[10px] text-muted-foreground font-medium">O resultado final atendeu a necessidade?</p>
                            </div>
                         </div>
                         <Badge className="bg-emerald-500 text-white font-bold uppercase text-[9px]">Ativado</Badge>
                      </div>

                      <div className="flex items-center justify-between p-6 rounded-2xl glass border-primary/10">
                         <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                               <TrendingUp className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                               <p className="text-xs font-black uppercase tracking-tight">Ease of Use</p>
                               <p className="text-[10px] text-muted-foreground font-medium">Quão fácil foi abrir este chamado?</p>
                            </div>
                         </div>
                         <Badge className="bg-blue-500 text-white font-bold uppercase text-[9px]">Ativado</Badge>
                      </div>
                   </div>
                </div>
             </div>
          </TabsContent>
        </Tabs>
      </div>
    </ModuleGuard>
  )
}
