"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useGovernance, ServiceItem } from "./use-governance"
import { Loader2, AlertCircle } from "lucide-react"

const itemSchema = z.object({
  definition: z.coerce.number().min(1, "Selecione uma definição de serviço"),
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
  record_type: z.enum(["incident", "service_request", "problem", "change"]),
  default_sla_policy: z.coerce.number().optional(),
  estimated_cost: z.coerce.number().min(0),
  approval_required: z.boolean().default(false),
  is_active: z.boolean().default(true)
})

type ItemSchema = z.infer<typeof itemSchema>

interface ServiceItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ServiceItemDialog({ open, onOpenChange }: ServiceItemDialogProps) {
  const { createServiceItem, serviceDefinitions, slaPolicies } = useGovernance()
  
  const form = useForm<ItemSchema>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      name: "",
      description: "",
      record_type: "service_request",
      estimated_cost: 0,
      approval_required: false,
      is_active: true
    }
  })

  const onSubmit = async (data: ItemSchema) => {
    try {
      await createServiceItem.mutateAsync(data)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      // Erro tratado no hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-slate-950 border-white/10 text-white rounded-[2rem] overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
        
        <DialogHeader className="pt-6">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter text-emerald-500">Novo Item de Serviço</DialogTitle>
          <DialogDescription className="text-slate-400 font-medium">
            Adicione um item ao catálogo de serviços para que usuários possam solicitá-lo.
          </DialogDescription>
        </DialogHeader>

        {serviceDefinitions.length === 0 ? (
          <div className="p-8 text-center space-y-4">
             <div className="h-16 w-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="h-8 w-8 text-amber-500" />
             </div>
             <div className="space-y-2">
                <p className="font-black uppercase tracking-widest text-xs">Nenhuma Definição Encontrada</p>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Antes de criar um item, você precisa cadastrar uma Definição de Serviço (ex: Suporte de Software) e uma Categoria no backend.
                </p>
             </div>
             <Button variant="outline" className="rounded-xl font-bold uppercase text-[10px]" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Definição Base</Label>
                <Select onValueChange={(v) => form.setValue("definition", Number(v))}>
                  <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
                    {serviceDefinitions.map(def => (
                      <SelectItem key={def.id} value={def.id.toString()}>{def.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.definition && (
                  <p className="text-[10px] text-rose-500 font-bold uppercase">{form.formState.errors.definition.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome do Item</Label>
                <Input 
                  id="name" 
                  placeholder="Ex: Instalação de Adobe Creative Cloud" 
                  className="bg-white/5 border-white/10 rounded-xl h-12"
                  {...form.register("name")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Descrição Detalhada</Label>
              <Textarea 
                id="description" 
                placeholder="Explique o que o usuário receberá ao solicitar este item..." 
                className="bg-white/5 border-white/10 rounded-xl min-h-[80px]"
                {...form.register("description")}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo ITIL</Label>
                <Select defaultValue="service_request" onValueChange={(v) => form.setValue("record_type", v as any)}>
                  <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
                    <SelectItem value="incident">Incidente</SelectItem>
                    <SelectItem value="service_request">Requisição de Serviço</SelectItem>
                    <SelectItem value="problem">Problema</SelectItem>
                    <SelectItem value="change">Mudança</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">SLA Padrão</Label>
                <Select onValueChange={(v) => form.setValue("default_sla_policy", Number(v))}>
                  <SelectTrigger className="bg-white/5 border-white/10 rounded-xl h-12">
                    <SelectValue placeholder="Opcional..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
                    {slaPolicies.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="estimated_cost" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Custo Estimado (R$)</Label>
                <Input 
                  id="estimated_cost" 
                  type="number"
                  step="0.01"
                  className="bg-white/5 border-white/10 rounded-xl h-12"
                  {...form.register("estimated_cost")}
                />
              </div>

              <div className="flex flex-col justify-end gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="approval_required" 
                    checked={form.watch("approval_required")}
                    onCheckedChange={(c) => form.setValue("approval_required", !!c)}
                  />
                  <Label htmlFor="approval_required" className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">Exige Aprovação</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="is_active" 
                    checked={form.watch("is_active")}
                    onCheckedChange={(c) => form.setValue("is_active", !!c)}
                  />
                  <Label htmlFor="is_active" className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">Ativo no Catálogo</Label>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-6">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="rounded-xl font-bold uppercase tracking-widest text-[10px]"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createServiceItem.isPending}
                className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest text-[10px] px-8 shadow-lg shadow-emerald-500/20"
              >
                {createServiceItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Item"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
