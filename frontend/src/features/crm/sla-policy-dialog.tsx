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
import { Checkbox } from "@/components/ui/checkbox"
import { useGovernance, SLAPolicy } from "./use-governance"
import { Loader2 } from "lucide-react"

const slaSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
  target_response_minutes: z.coerce.number().min(1, "Mínimo 1 minuto"),
  target_resolution_minutes: z.coerce.number().min(1, "Mínimo 1 minuto"),
  business_hours_only: z.boolean().default(true)
})

type SLASchema = z.infer<typeof slaSchema>

interface SLAPolicyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SLAPolicyDialog({ open, onOpenChange }: SLAPolicyDialogProps) {
  const { createSLAPolicy } = useGovernance()
  const form = useForm<SLASchema>({
    resolver: zodResolver(slaSchema),
    defaultValues: {
      name: "",
      description: "",
      target_response_minutes: 60,
      target_resolution_minutes: 240,
      business_hours_only: true
    }
  })

  const onSubmit = async (data: SLASchema) => {
    try {
      await createSLAPolicy.mutateAsync(data)
      form.reset()
      onOpenChange(false)
    } catch (error) {
      // Erro já tratado no hook via toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-white/10 text-white rounded-[2rem] overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-blue-500" />
        
        <DialogHeader className="pt-6">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Nova Política de SLA</DialogTitle>
          <DialogDescription className="text-slate-400 font-medium">
            Defina os tempos alvo de resposta e resolução para seus serviços.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nome da Política</Label>
            <Input 
              id="name" 
              placeholder="Ex: Suporte Premium Gold" 
              className="bg-white/5 border-white/10 rounded-xl h-12 focus-visible:ring-primary"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-[10px] text-rose-500 font-bold uppercase">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Descrição</Label>
            <Textarea 
              id="description" 
              placeholder="Detalhes sobre quem esta política atende..." 
              className="bg-white/5 border-white/10 rounded-xl min-h-[100px] focus-visible:ring-primary"
              {...form.register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target_response_minutes" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Resposta (Min)</Label>
              <Input 
                id="target_response_minutes" 
                type="number"
                className="bg-white/5 border-white/10 rounded-xl h-12 focus-visible:ring-primary"
                {...form.register("target_response_minutes")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_resolution_minutes" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Resolução (Min)</Label>
              <Input 
                id="target_resolution_minutes" 
                type="number"
                className="bg-white/5 border-white/10 rounded-xl h-12 focus-visible:ring-primary"
                {...form.register("target_resolution_minutes")}
              />
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-white/5 p-4 rounded-xl border border-white/10">
            <Checkbox 
              id="business_hours_only" 
              checked={form.watch("business_hours_only")}
              onCheckedChange={(checked) => form.setValue("business_hours_only", !!checked)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="business_hours_only"
                className="text-xs font-black uppercase tracking-widest cursor-pointer"
              >
                Apenas Horário Comercial
              </label>
              <p className="text-[10px] text-slate-500 font-medium">
                Pausar contagem fora do horário de expediente.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createSLAPolicy.isPending}
              className="rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px] px-8 shadow-lg shadow-primary/20"
            >
              {createSLAPolicy.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Política"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
