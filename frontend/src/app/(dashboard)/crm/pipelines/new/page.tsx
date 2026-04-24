"use client"

import * as React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Rocket, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ModuleGuard } from "@/components/module-guard"
import { useCRM } from "@/features/crm/use-crm"
import { toast } from "sonner"
import Link from "next/link"

export default function NewPipelinePage() {
  const router = useRouter()
  const { createPipeline } = useCRM()
  const [name, setName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [mounted, setMounted] = useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const handleCreate = async () => {
    if (name.length < 3) {
      toast.error("O nome deve ter pelo menos 3 caracteres.")
      return
    }

    setIsCreating(true)
    try {
      const pipeline = await createPipeline.mutateAsync({
        name,
        visibility: "company",
        groups: []
      })
      
      toast.success("Pipeline criado! Redirecionando para configuração...")
      router.push(`/crm/pipelines/${pipeline.id}`)
    } catch (error) {
      toast.error("Erro ao criar pipeline.")
    } finally {
      setIsCreating(false)
    }
  }

  if (!mounted) return null

  return (
    <ModuleGuard moduleCode="crm">
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-12">
        <div className="space-y-4">
          <Link href="/crm/pipelines" className="group flex items-center text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar ao Hub
          </Link>
          <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter uppercase leading-none">
            Novo Fluxo de Valor
          </h1>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">
            Inicie um novo processo de Service Desk ou Gestão de Valor
          </p>
        </div>

        <div className="glass rounded-[2.5rem] p-10 space-y-8 shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-8 opacity-5">
              <Plus className="h-32 w-32" />
           </div>

           <div className="space-y-4 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary ml-1">Nome do Pipeline</label>
                <Input 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Suporte Nível 2, Projetos Cloud..."
                  className="h-16 glass text-xl font-bold rounded-2xl border-primary/10 focus-visible:ring-primary/20"
                  autoFocus
                />
              </div>

              <div className="bg-primary/5 rounded-2xl p-6 border border-primary/10 flex items-start gap-4">
                 <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <Rocket className="h-5 w-5 text-primary" />
                 </div>
                 <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-tight">Auto-Configuração ITIL v5</p>
                    <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                      Ao criar, você poderá aplicar instantaneamente o template de Swarming e Value Stream Mapping conforme ITIL Version 5.
                    </p>
                 </div>
              </div>
           </div>

           <div className="flex flex-col gap-3">
              <Button 
                onClick={handleCreate}
                disabled={isCreating || name.length < 3}
                className="h-16 rounded-2xl bg-primary text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
              >
                {isCreating ? "Criando Estrutura..." : "Criar e Configurar"}
              </Button>
              <Button 
                variant="ghost" 
                asChild
                className="h-12 rounded-xl font-black uppercase tracking-widest text-[10px] text-muted-foreground"
              >
                <Link href="/crm/pipelines">Cancelar</Link>
              </Button>
           </div>
        </div>
      </div>
    </ModuleGuard>
  )
}
