"use client"

import * as React from "react"
import Link from "next/link"
import { useMemo, useState, useEffect } from "react"
import { ArrowLeft, Plus, Settings2, Trash2, ChevronUp, ChevronDown, Rocket, Save, LayoutGrid } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModuleGuard } from "@/components/module-guard"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { api } from "@/lib/axios"
import { useCRM, type Pipeline, type CRMColumn } from "./use-crm"
import { AutomationRulesPanel } from "./automation-rules-panel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useQueryClient, useMutation } from "@tanstack/react-query"

export function PipelineDetail({ pipelineId }: { pipelineId: number }) {
  const queryClient = useQueryClient()
  const { pipelines, isLoading, updatePipeline, deletePipeline } = useCRM()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])

  const pipeline = useMemo(() => pipelines.find((item) => item.id === pipelineId), [pipelines, pipelineId])
  
  // Estados para edição
  const [name, setName] = useState("")
  const [newColumnTitle, setNewColumnTitle] = useState("")
  const [columnToDelete, setColumnToDelete] = useState<CRMColumn | null>(null)
  const [pipelineToDelete, setPipelineToDelete] = useState<Pipeline | null>(null)

  useEffect(() => {
    if (pipeline) {
      setName(pipeline.name)
    }
  }, [pipeline])

  if (!mounted || isLoading || (pipelines.length > 0 && !pipeline && !isLoading)) {
    // Se ainda não montou, está carregando ou se temos pipelines mas o específico ainda não apareceu 
    // (pode ser delay de cache), mostramos o skeleton brevemente
    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-pulse p-4">
            <div className="h-10 w-48 rounded-xl bg-muted/20" />
            <div className="h-24 w-full rounded-[2.5rem] bg-muted/10" />
            <div className="grid gap-8 md:grid-cols-[1fr_400px]">
                <div className="h-96 rounded-[2.5rem] bg-muted/5" />
                <div className="h-64 rounded-[2.5rem] bg-muted/5" />
            </div>
        </div>
    )
  }

  const sortedColumns = useMemo(() => {
    return [...(pipeline?.columns || [])].sort((a, b) => a.order - b.order || a.id - b.id)
  }, [pipeline?.columns])

  const reorderColumns = useMutation({
    mutationFn: async (payload: { columns: { id: number; order: number }[] }) => {
      for (const item of payload.columns) {
        await api.patch(`/api/crm/columns/${item.id}/`, { order: item.order })
      }
      return payload
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      toast.success("Ordem atualizada")
    }
  })

  const createColumn = useMutation({
    mutationFn: async (title: string) => {
      const maxOrder = Math.max(-1, ...sortedColumns.map(c => c.order))
      const response = await api.post("/api/crm/columns/", {
        pipeline: pipelineId,
        title,
        order: maxOrder + 1,
        column_kind: "active"
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      setNewColumnTitle("")
      toast.success("Coluna adicionada")
    }
  })

  const removeColumn = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/crm/columns/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      setColumnToDelete(null)
      toast.success("Coluna removida")
    }
  })

  const applyITIL = useMutation({
    mutationFn: async () => {
      await api.post(`/api/crm/pipelines/${pipelineId}/apply_itil_template/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] })
      toast.success("Template ITIL v5 aplicado!")
    }
  })

  if (isLoading) return <div className="p-8 animate-pulse bg-muted/10 rounded-[2rem] h-96" />

  if (!pipeline) {
    return (
      <div className="p-12 text-center glass rounded-[2rem] border border-dashed">
        <h2 className="text-xl font-black uppercase">Pipeline não encontrado</h2>
        <Link href="/crm/pipelines" className="mt-4 inline-block">
          <Button variant="outline" className="rounded-xl font-bold uppercase">Voltar ao Hub</Button>
        </Link>
      </div>
    )
  }

  return (
    <ModuleGuard moduleCode="crm">
      <div className="space-y-8 max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <Link href="/crm/pipelines" className="group flex items-center text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
              <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
              Voltar ao Hub
            </Link>
            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase leading-none">
              Configurar Fluxo
            </h1>
          </div>

          <div className="flex items-center gap-3">
             <Button 
               variant="outline" 
               className="h-12 glass border-rose-500/20 text-rose-500 font-black uppercase tracking-widest"
               onClick={() => setPipelineToDelete(pipeline)}
             >
               <Trash2 className="h-4 w-4 mr-2" /> Excluir
             </Button>
             <Link href={`/crm?pipeline=${pipeline.id}`}>
               <Button className="h-12 rounded-xl bg-primary text-white font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                 <LayoutGrid className="h-4 w-4 mr-2" /> Ver no Kanban
               </Button>
             </Link>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[1fr_400px]">
          {/* Main Config */}
          <div className="space-y-8">
            <section className="glass rounded-[2.5rem] p-8 space-y-6">
               <div className="flex items-center justify-between border-b border-primary/5 pb-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Identidade do Pipeline</h3>
                  <Badge variant="outline" className="rounded-full font-black text-[10px]">ID: {pipeline.id}</Badge>
               </div>
               
               <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome do Fluxo</label>
                    <div className="flex gap-2">
                      <Input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="h-14 glass text-lg font-bold rounded-2xl"
                      />
                      <Button 
                        disabled={name === pipeline.name || name.length < 3 || updatePipeline.isPending}
                        onClick={() => updatePipeline.mutate({ ...pipeline, name })}
                        className="h-14 w-14 rounded-2xl"
                      >
                        <Save className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
               </div>
            </section>

            <section className="glass rounded-[2.5rem] p-8 space-y-6">
               <div className="flex items-center justify-between border-b border-primary/5 pb-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-primary">Arquitetura de Colunas</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/5"
                    onClick={() => applyITIL.mutate()}
                    disabled={applyITIL.isPending}
                  >
                    <Rocket className="h-3 w-3 mr-2" /> Aplicar ITIL v5
                  </Button>
               </div>

               <div className="space-y-3">
                  {sortedColumns.map((col, idx) => (
                    <div key={col.id} className="flex items-center gap-4 p-4 rounded-3xl bg-background/40 border border-primary/5 hover:bg-background/60 transition-colors group">
                       <div className="flex flex-col gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                            disabled={idx === 0}
                            onClick={() => {
                              const next = [...sortedColumns]
                              ;[next[idx-1], next[idx]] = [next[idx], next[idx-1]]
                              reorderColumns.mutate({ columns: next.map((c, i) => ({ id: c.id, order: i * 10 })) })
                            }}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                            disabled={idx === sortedColumns.length - 1}
                            onClick={() => {
                              const next = [...sortedColumns]
                              ;[next[idx+1], next[idx]] = [next[idx], next[idx+1]]
                              reorderColumns.mutate({ columns: next.map((c, i) => ({ id: c.id, order: i * 10 })) })
                            }}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                       </div>
                       
                       <div className="flex-1 min-w-0">
                          <Input 
                            defaultValue={col.title}
                            className="h-10 bg-transparent border-none font-bold text-base focus-visible:ring-0 p-0"
                            onBlur={(e) => {
                              const val = e.target.value.trim()
                              if (val && val !== col.title) {
                                api.patch(`/api/crm/columns/${col.id}/`, { title: val })
                                  .then(() => queryClient.invalidateQueries({ queryKey: ["crm-pipelines"] }))
                              }
                            }}
                          />
                          <div className="flex items-center gap-2 mt-1">
                             <Badge variant="outline" className="text-[9px] uppercase font-black tracking-widest py-0">{col.column_kind}</Badge>
                             {col.marks_done && <Badge className="bg-emerald-500 text-white text-[9px] uppercase font-black tracking-widest py-0">Concluído</Badge>}
                          </div>
                       </div>

                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="text-muted-foreground/30 hover:text-rose-500 transition-colors"
                         onClick={() => setColumnToDelete(col)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-4">
                     <Input 
                       placeholder="NOVA COLUNA..." 
                       value={newColumnTitle}
                       onChange={e => setNewColumnTitle(e.target.value)}
                       className="h-12 glass rounded-2xl font-bold"
                     />
                     <Button 
                       className="h-12 px-6 rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white font-black"
                       disabled={newColumnTitle.length < 2 || createColumn.isPending}
                       onClick={() => createColumn.mutate(newColumnTitle)}
                     >
                       <Plus className="h-5 w-5" />
                     </Button>
                  </div>
               </div>
            </section>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-6">
             <div className="glass rounded-[2.5rem] p-8 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Estatísticas do Fluxo</h4>
                <div className="grid grid-cols-2 gap-4">
                   <div className="p-4 rounded-3xl bg-primary/5 border border-primary/10">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Total Colunas</p>
                      <p className="text-2xl font-black">{sortedColumns.length}</p>
                   </div>
                   <div className="p-4 rounded-3xl bg-primary/5 border border-primary/10">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Visibilidade</p>
                      <p className="text-xs font-black uppercase truncate">{pipeline.visibility}</p>
                   </div>
                </div>
                <div className="p-6 rounded-3xl bg-slate-900 text-white space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Arquitetura Atlas</p>
                   <p className="text-xs leading-relaxed text-slate-400 font-bold">
                     Este fluxo utiliza o motor de sincronização ITIL v5, garantindo que cada coluna tenha um estado legado correspondente para máxima compatibilidade.
                   </p>
                </div>
             </div>
          </div>
        </div>

        {/* Automation Rules */}
        <div className="rounded-3xl border bg-card/60 backdrop-blur-sm p-6 sm:p-8">
          <AutomationRulesPanel pipelineId={pipelineId} />
        </div>

        {/* Dialogs */}
        <AlertDialog open={!!columnToDelete} onOpenChange={() => setColumnToDelete(null)}>
           <AlertDialogContent className="glass">
              <AlertDialogHeader>
                 <AlertDialogTitle className="font-black uppercase tracking-tight italic">Excluir Coluna?</AlertDialogTitle>
                 <AlertDialogDescription className="font-bold">
                    Isso removerá a coluna "{columnToDelete?.title}". Cards nesta coluna podem ficar órfãos ou precisar de realocação manual.
                 </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                 <AlertDialogCancel className="rounded-xl font-bold uppercase tracking-widest text-xs">Cancelar</AlertDialogCancel>
                 <AlertDialogAction 
                    className="bg-rose-500 hover:bg-rose-600 rounded-xl font-bold uppercase tracking-widest text-xs"
                    onClick={() => columnToDelete && removeColumn.mutate(columnToDelete.id)}
                 >
                    Confirmar Exclusão
                 </AlertDialogAction>
              </AlertDialogFooter>
           </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!pipelineToDelete} onOpenChange={() => setPipelineToDelete(null)}>
           <AlertDialogContent className="glass">
              <AlertDialogHeader>
                 <AlertDialogTitle className="font-black uppercase tracking-tight italic text-rose-500">EXCLUIR TODO O PIPELINE?</AlertDialogTitle>
                 <AlertDialogDescription className="font-bold">
                    ESTA AÇÃO É IRREVERSÍVEL. Todos os dados de configuração deste fluxo serão perdidos. Cards vinculados a este fluxo precisarão ser realocados.
                 </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                 <AlertDialogCancel className="rounded-xl font-bold uppercase tracking-widest text-xs">Cancelar</AlertDialogCancel>
                 <AlertDialogAction 
                    className="bg-rose-500 hover:bg-rose-600 rounded-xl font-bold uppercase tracking-widest text-xs"
                    onClick={() => {
                      deletePipeline.mutate(pipelineId, {
                        onSuccess: () => window.location.href = "/crm/pipelines"
                      })
                    }}
                 >
                    SIM, EXCLUIR DEFINITIVAMENTE
                 </AlertDialogAction>
              </AlertDialogFooter>
           </AlertDialogContent>
        </AlertDialog>
      </div>
    </ModuleGuard>
  )
}
