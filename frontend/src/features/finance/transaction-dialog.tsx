"use client"

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format } from "date-fns"
import { Plus, CalendarDays, RefreshCcw, DollarSign, Wallet, ArrowUpRight, ArrowDownRight, Tag, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { FinanceCategory, Transaction } from "./use-finance"

const transactionSchema = z.object({
  description: z.string().min(1, "Descrição obrigatória"),
  amount: z.string().min(1, "Valor obrigatório"),
  type: z.enum(["in", "out"]),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  due_date: z.string(),
  competence_date: z.string(),
  category: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_rule: z.string().optional().nullable(),
})

type TransactionFormValues = z.infer<typeof transactionSchema>

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  categories,
  onCreateTransaction,
  onUpdateTransaction,
  onCreateCategory,
  isSaving,
  isCreatingCategory,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  categories: FinanceCategory[]
  onCreateTransaction: (values: Partial<Transaction>) => Promise<void>
  onUpdateTransaction: (values: Partial<Transaction> & { id: number }) => Promise<void>
  onCreateCategory: (values: { name: string; color: string }) => Promise<FinanceCategory>
  isSaving: boolean
  isCreatingCategory: boolean
}) {
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)

  const sharedCategories = useMemo(() => categories.filter((c) => c.is_shared !== false), [categories])
  const personalCategories = useMemo(() => categories.filter((c) => c.is_shared === false), [categories])

  const categoryForm = useForm<{ name: string; color: string }>({
    defaultValues: { name: "", color: "#000000" },
  })

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: "",
      amount: "",
      type: "out",
      status: "pending",
      due_date: format(new Date(), "yyyy-MM-dd"),
      competence_date: format(new Date(), "yyyy-MM-dd"),
      is_recurring: false,
      recurrence_rule: "",
    },
  })

  useEffect(() => {
    if (!open) return
    if (transaction) {
      form.reset({
        description: transaction.description,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        due_date: transaction.due_date,
        competence_date: transaction.competence_date,
        category: transaction.category?.toString(),
        is_recurring: transaction.is_recurring || false,
        recurrence_rule: transaction.recurrence_rule || "",
      })
    } else {
      form.reset({
        description: "",
        amount: "",
        type: "out",
        status: "pending",
        due_date: format(new Date(), "yyyy-MM-dd"),
        competence_date: format(new Date(), "yyyy-MM-dd"),
        is_recurring: false,
        recurrence_rule: "",
      })
    }
  }, [form, open, transaction])

  const onSubmit = async (data: TransactionFormValues) => {
    const payload = {
      description: data.description,
      amount: data.amount,
      type: data.type,
      status: data.status,
      due_date: data.due_date,
      competence_date: data.competence_date,
      category: data.category ? parseInt(data.category) : undefined,
      is_recurring: data.is_recurring,
      recurrence_rule: data.is_recurring ? data.recurrence_rule : null,
    }

    try {
      if (transaction) {
        await onUpdateTransaction({ id: transaction.id, ...payload })
      } else {
        await onCreateTransaction(payload)
      }
      onOpenChange(false)
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[680px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-300">
          <DialogHeader className="px-8 pt-8 pb-6 bg-white/5 border-b border-white/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
               <Wallet className="h-24 w-24 text-primary" />
            </div>
            <div className="relative z-10 space-y-1">
               <DialogTitle className="text-3xl font-black tracking-tighter flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  {transaction ? "Ajustar Transação" : "Nova Movimentação"}
               </DialogTitle>
               <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                 Registro detalhado de entrada ou saída no livro-razão Atlas.
               </DialogDescription>
            </div>
          </DialogHeader>

          <div className="px-8 py-8">
            <Form {...form}>
              <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Identificação do Lançamento</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input placeholder="Ex: Contratação Licença Enterprise AWS" {...field} className="h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 focus:ring-primary/20 transition-all font-bold text-sm shadow-inner" />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20"><Tag className="h-4 w-4" /></div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Valor Nominal (BRL)</FormLabel>
                        <FormControl>
                          <div className="relative">
                             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-primary/40">R$</span>
                             <Input type="number" step="0.01" placeholder="0.00" {...field} className="h-12 pl-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 focus:ring-primary/20 transition-all font-black text-lg shadow-inner" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Natureza do Fluxo</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm shadow-inner">
                               <div className="flex items-center gap-2">
                                  {field.value === 'in' ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <ArrowDownRight className="h-4 w-4 text-rose-500" />}
                                  <SelectValue />
                               </div>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                            <SelectItem value="in" className="rounded-xl font-bold">
                               <div className="flex items-center gap-2">
                                  <ArrowUpRight className="h-4 w-4 text-emerald-500" /> Receita (Entrada)
                               </div>
                            </SelectItem>
                            <SelectItem value="out" className="rounded-xl font-bold">
                               <div className="flex items-center gap-2">
                                  <ArrowDownRight className="h-4 w-4 text-rose-500" /> Despesa (Saída)
                               </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Data de Vencimento</FormLabel>
                        <FormControl>
                           <div className="relative">
                              <Input type="date" {...field} className="h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm shadow-inner pr-10" />
                              <CalendarDays className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/40" />
                           </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Estágio de Liquidação</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm shadow-inner">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                            <SelectItem value="pending" className="rounded-xl font-bold">Aguardando Pagamento</SelectItem>
                            <SelectItem value="paid" className="rounded-xl font-bold text-emerald-500">Liquidado / Pago</SelectItem>
                            <SelectItem value="overdue" className="rounded-xl font-bold text-rose-500">Em Atraso Critico</SelectItem>
                            <SelectItem value="cancelled" className="rounded-xl font-bold text-slate-500">Cancelado / Estornado</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="competence_date"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Período de Competência</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} className="h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm shadow-inner" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem className="space-y-2">
                        <div className="flex items-center justify-between gap-2 h-4 mb-2">
                          <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Classificação Contábil</FormLabel>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-6 text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary/5 rounded-md px-2"
                            onClick={() => {
                              categoryForm.reset({ name: "", color: "#000000" })
                              setIsCategoryDialogOpen(true)
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Criar Segmento
                          </Button>
                        </div>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-sm shadow-inner">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                            {sharedCategories.length > 0 && (
                              <div className="px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-muted-foreground opacity-50">Empresa (SLA)</div>
                            )}
                            {sharedCategories.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)} className="rounded-xl font-bold">
                                 <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                                    {c.name}
                                 </div>
                              </SelectItem>
                            ))}
                            {personalCategories.length > 0 && (
                              <div className="px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-muted-foreground opacity-50 mt-2">Segmentos Pessoais</div>
                            )}
                            {personalCategories.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)} className="rounded-xl font-bold">
                                 <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                                    {c.name}
                                 </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-6 shadow-inner">
                  <FormField
                    control={form.control}
                    name="is_recurring"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4 space-y-0">
                        <div className="space-y-1">
                          <FormLabel className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
                            <RefreshCcw className="h-4 w-4 text-primary" />
                            Programar Recorrência
                          </FormLabel>
                          <FormDescription className="text-[10px] font-bold text-muted-foreground/60">Gera lançamentos automáticos no calendário Atlas.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <AnimatePresence>
                    {form.watch("is_recurring") && (
                       <motion.div
                         initial={{ height: 0, opacity: 0 }}
                         animate={{ height: "auto", opacity: 1 }}
                         exit={{ height: 0, opacity: 0 }}
                         className="overflow-hidden"
                       >
                         <FormField
                           control={form.control}
                           name="recurrence_rule"
                           render={({ field }) => (
                             <FormItem className="pt-4 border-t border-white/5">
                               <FormLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">Frequência do Ciclo</FormLabel>
                               <Select onValueChange={field.onChange} value={field.value || ""}>
                                 <FormControl>
                                   <SelectTrigger className="h-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs">
                                     <SelectValue placeholder="Definir ciclo..." />
                                   </SelectTrigger>
                                 </FormControl>
                                 <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                                   <SelectItem value="FREQ=DAILY" className="rounded-xl font-bold">Ciclo Diário</SelectItem>
                                   <SelectItem value="FREQ=WEEKLY" className="rounded-xl font-bold">Ciclo Semanal</SelectItem>
                                   <SelectItem value="FREQ=MONTHLY" className="rounded-xl font-bold">Ciclo Mensal</SelectItem>
                                   <SelectItem value="FREQ=YEARLY" className="rounded-xl font-bold">Ciclo Anual</SelectItem>
                                 </SelectContent>
                               </Select>
                               <FormMessage />
                             </FormItem>
                           )}
                         />
                       </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </form>
            </Form>
          </div>

          <div className="px-8 py-6 bg-white/5 border-t border-white/10 flex items-center justify-between gap-4">
             <Button 
               type="button" 
               variant="ghost" 
               onClick={() => onOpenChange(false)}
               className="h-11 px-6 rounded-xl font-black uppercase tracking-widest text-[10px] text-muted-foreground hover:bg-white/5 transition-all"
             >
               Descartar
             </Button>
             <Button 
               type="submit" 
               form="transaction-form" 
               disabled={isSaving}
               className="h-11 px-10 rounded-xl font-black uppercase tracking-widest text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 shadow-xl shadow-primary/20 transition-all min-w-[140px]"
             >
               {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : transaction ? "Atualizar Registro" : "Confirmar Lançamento"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Mini-Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[420px] p-0 border-white/10 bg-background/98 backdrop-blur-3xl rounded-[2rem] overflow-hidden shadow-2xl">
          <DialogHeader className="px-6 py-6 bg-white/5 border-b border-white/10">
            <DialogTitle className="text-xl font-black tracking-tighter flex items-center gap-3">
               Nova Classificação
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 py-6">
            <form
              id="category-form"
              className="space-y-6"
              onSubmit={categoryForm.handleSubmit(async (values) => {
                const name = values.name.trim()
                if (!name) {
                  toast.error("Nome da categoria é obrigatório.")
                  return
                }
                const created = await onCreateCategory({ name, color: values.color })
                form.setValue("category", String(created.id), { shouldDirty: true })
                setIsCategoryDialogOpen(false)
              })}
            >
              <div className="space-y-2">
                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Nome do Segmento</FormLabel>
                <Input {...categoryForm.register("name", { required: true })} placeholder="Ex: Infraestrutura" className="h-11 rounded-xl border-white/10 bg-white/5 font-bold" />
              </div>
              <div className="space-y-2">
                <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Sinalizador de Cor</FormLabel>
                <div className="flex gap-4 items-center">
                   <Input type="color" {...categoryForm.register("color", { required: true })} className="h-12 w-20 p-1 rounded-xl border-white/10 bg-white/5 cursor-pointer" />
                   <div className="text-[10px] font-bold text-muted-foreground/60">Selecione uma cor para identificação visual rápida na tabela.</div>
                </div>
              </div>
            </form>
          </div>
          <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsCategoryDialogOpen(false)} className="h-9 rounded-lg font-black uppercase tracking-widest text-[9px]">Voltar</Button>
            <Button type="submit" form="category-form" disabled={isCreatingCategory} className="h-9 rounded-lg font-black uppercase tracking-widest text-[9px] bg-primary text-primary-foreground">
               {isCreatingCategory ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar Segmento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
