"use client"

import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { getPipelineColumns, Pipeline, useCRM } from "./use-crm"
import { Plus } from "lucide-react"

const dealSchema = z.object({
  title: z.string().min(1, "O título é obrigatório"),
  description: z.string().optional(),
  contact: z.string().min(1, "Selecione um contato"),
  column: z.string().min(1, "Selecione a coluna inicial"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  closing_date: z.string().optional(),
})

type DealFormValues = z.infer<typeof dealSchema>

interface CreateDealModalProps {
  pipeline?: Pipeline
}

export function CreateDealModal({ pipeline }: CreateDealModalProps) {
  const [open, setOpen] = useState(false)
  const { contacts, pipelines, createDeal } = useCRM()

  const availableColumns = useMemo(() => {
    if (pipeline) return getPipelineColumns(pipeline)
    const list = Array.isArray(pipelines) ? pipelines : []
    return list.flatMap((item) => getPipelineColumns(item))
  }, [pipeline, pipelines])
  const defaultColumn = availableColumns[0]?.id.toString() || ""
  const defaultValues = useMemo<DealFormValues>(() => ({
    title: "",
    description: "",
    contact: "",
    priority: "MEDIUM",
    column: defaultColumn,
    closing_date: "",
  }), [defaultColumn])

  const form = useForm<DealFormValues>({
    resolver: zodResolver(dealSchema),
    defaultValues,
  })

  useEffect(() => {
    const currentColumnValue = form.getValues("column")
    const columnStillAvailable = availableColumns.some((column) => column.id.toString() === currentColumnValue)

    if ((!currentColumnValue || !columnStillAvailable) && defaultColumn) {
      form.setValue("column", defaultColumn, { shouldValidate: true })
    }
  }, [availableColumns, defaultColumn, form])

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen) {
      form.reset(defaultValues)
    }
  }

  const onSubmit = async (data: DealFormValues) => {
    try {
      const selectedColumn = availableColumns.find((column) => column.id === parseInt(data.column))

      await createDeal.mutateAsync({
        title: data.title,
        description: data.description,
        contact: parseInt(data.contact),
        column: selectedColumn?.id,
        priority: data.priority,
        closing_date: data.closing_date || undefined
      })
      setOpen(false)
      form.reset(defaultValues)
    } catch {
       // Handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="glass-primary shadow-lg shadow-primary/20">
          <Plus className="mr-2 h-4 w-4" /> Novo Card
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[520px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 glass grid grid-rows-[auto_1fr]">
        <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
          <DialogTitle>Novo Card no CRM</DialogTitle>
          <DialogDescription>
            Crie um novo chamado ou negócio no seu pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          <div className="p-4 sm:p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título / Assunto</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Manutenção Servidor Matriz..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente / Lead</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contacts.map(c => (
                          <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="LOW">Baixa</SelectItem>
                        <SelectItem value="MEDIUM">Média</SelectItem>
                        <SelectItem value="HIGH">Alta</SelectItem>
                        <SelectItem value="URGENT">Urgente / Crítica</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
                name="column"
              render={({ field }) => (
                <FormItem>
                    <FormLabel>Coluna Inicial</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl>
                      <SelectTrigger>
                          <SelectValue placeholder="Selecione uma coluna..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                        {availableColumns.map((column) => (
                          <SelectItem key={column.id} value={column.id.toString()}>
                            {column.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="closing_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Limite (SLA) - Sincroniza com Agenda</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Anotações Técnicas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descreva os detalhes..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
               <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
               <Button type="submit" disabled={createDeal.isPending}>
                 {createDeal.isPending ? "Criando..." : "Salvar Card"}
               </Button>
            </div>
              </form>
            </Form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
