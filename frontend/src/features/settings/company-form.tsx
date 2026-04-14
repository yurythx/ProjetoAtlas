"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Company } from "@/types"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Building2, Globe, Save } from "lucide-react"
import { toast } from "sonner"
import { useEffect } from "react"
import { Skeleton } from "@/components/ui/skeleton"

const companySchema = z.object({
  name: z.string().min(2, "O nome da empresa deve ter pelo menos 2 caracteres."),
  domain: z.string().regex(/^(?!:\/\/)([a-zA-Z0-9-_]+\.)*[a-zA-Z0-9][a-zA-Z0-9-_]+\.[a-zA-Z]{2,11}?$/, "Insira um domínio válido (ex: app.acme.com)").optional().or(z.literal("")),
})

export function CompanyForm() {
  const queryClient = useQueryClient()

  const { data: company, isLoading } = useQuery({
    queryKey: ['company-current'],
    queryFn: async ({ signal }) => {
      const res = await api.get<Company>(`/api/core/companies/current/`, { signal })
      return res.data
    },
    retry: false,
  })

  const form = useForm<z.infer<typeof companySchema>>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      domain: "",
    }
  })

  useEffect(() => {
    if (company) {
      form.reset({
        name: company.name,
        domain: company.domain || "",
      })
    }
  }, [company, form])

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof companySchema>) => {
      await api.patch(`/api/core/companies/current/`, values)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-current'] })
      toast.success("Configurações da empresa atualizadas!")
    },
    onError: () => {
      toast.error("Falha ao salvar configurações")
    }
  })

  if (isLoading) {
    return (
      <Card className="border-none shadow-none bg-transparent" role="status" aria-live="polite" aria-label="Carregando configurações da empresa">
        <CardHeader className="px-0">
          <Skeleton className="h-8 w-1/3 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent className="px-0 space-y-6">
          <Skeleton className="h-12 w-full max-w-2xl" />
          <Skeleton className="h-12 w-full max-w-2xl" />
          <Skeleton className="h-12 w-32" />
        </CardContent>
      </Card>
    )
  }

  if (!company) return null

  function onSubmit(values: z.infer<typeof companySchema>) {
    mutation.mutate(values)
  }

  return (
    <Card className="border-none shadow-none bg-transparent">
      <CardHeader className="px-0">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-2xl">Perfil da Organização</CardTitle>
            <CardDescription>Configure a identidade visual e domínio da sua empresa.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pt-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 max-w-2xl">
            <div className="space-y-6 p-6 border rounded-2xl bg-muted/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Building2 className="h-24 w-24" aria-hidden="true" />
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">Nome da Empresa</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome Comercial" className="h-11 bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="domain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold">Domínio Personalizado</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" aria-hidden="true" />
                        <Input placeholder="app.suaempresa.com" className="pl-10 h-11 bg-background" {...field} />
                      </div>
                    </FormControl>
                    <FormDescription className="text-xs">
                      Configure o CNAME do seu domínio apontando para <b>app.atlas.com</b>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" size="lg" className="px-8 shadow-lg shadow-primary/20" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Salvar Alterações
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
