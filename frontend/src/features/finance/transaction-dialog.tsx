"use client"

import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import type { FinanceCategory, Transaction } from "./use-finance"

const transactionSchema = z.object({
  description: z.string().min(1, "Descrição obrigatória"),
  amount: z.string().min(1, "Valor obrigatório"),
  type: z.enum(["in", "out"]),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]),
  due_date: z.string(),
  competence_date: z.string(),
  category: z.string().optional(),
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
      })
    } else {
      form.reset({
        description: "",
        amount: "",
        type: "out",
        status: "pending",
        due_date: format(new Date(), "yyyy-MM-dd"),
        competence_date: format(new Date(), "yyyy-MM-dd"),
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
    }

    if (transaction) {
      await onUpdateTransaction({ id: transaction.id, ...payload })
    } else {
      await onCreateTransaction(payload)
    }
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[620px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
          <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle>{transaction ? "Editar Transação" : "Nova Transação"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulário de criação e edição de transações financeiras.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
            <Form {...form}>
              <form id="transaction-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Pagamento AWS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="0.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="in">Receita</SelectItem>
                          <SelectItem value="out">Despesa</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vencimento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="paid">Pago</SelectItem>
                          <SelectItem value="overdue">Atrasado</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="competence_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Competência</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-end justify-between gap-2">
                        <FormLabel>Categoria</FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            categoryForm.reset({ name: "", color: "#000000" })
                            setIsCategoryDialogOpen(true)
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Nova categoria
                        </Button>
                      </div>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sharedCategories.length > 0 && (
                            <SelectItem value="__shared__" disabled>
                              Empresa
                            </SelectItem>
                          )}
                          {sharedCategories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                          {personalCategories.length > 0 && (
                            <SelectItem value="__personal__" disabled>
                              Minhas
                            </SelectItem>
                          )}
                          {personalCategories.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

            </form>
            </Form>
          </div>
          <div className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" form="transaction-form" disabled={isSaving}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[460px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
          <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription className="sr-only">Criar categoria pessoal.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
            <form
              id="category-form"
              className="space-y-4"
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
            <div className="grid gap-2">
              <FormLabel>Nome</FormLabel>
              <Input {...categoryForm.register("name", { required: true })} placeholder="Ex: Pessoal" />
            </div>
            <div className="grid gap-2">
              <FormLabel>Cor</FormLabel>
              <Input type="color" {...categoryForm.register("color", { required: true })} />
            </div>
          </form>
          </div>
          <div className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancelar</Button>
            <Button type="submit" form="category-form" disabled={isCreatingCategory}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
