"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Company } from "@/types"
import { api } from "@/lib/axios"
import { useQueryClient, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

const companySchema = z.object({
    name: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
    slug: z.string().min(2, "O slug deve ter pelo menos 2 caracteres").regex(/^[a-z0-9-]+$/, "O slug deve conter apenas letras minúsculas, números e hifens"),
    domain: z.string().optional().or(z.literal("")),
})

type CompanyFormValues = z.infer<typeof companySchema>

interface CompanyDialogProps {
    company: Company | null
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CompanyDialog({ company, open, onOpenChange }: CompanyDialogProps) {
    const queryClient = useQueryClient()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const form = useForm<CompanyFormValues>({
        resolver: zodResolver(companySchema),
        defaultValues: {
            name: "",
            slug: "",
            domain: "",
        },
    })

    useEffect(() => {
        if (company) {
            form.reset({
                name: company.name,
                slug: company.slug,
                domain: company.domain || "",
            })
        } else {
            form.reset({
                name: "",
                slug: "",
                domain: "",
            })
        }
    }, [company, form])

    const mutation = useMutation({
        mutationFn: async (values: CompanyFormValues) => {
            if (company) {
                await api.patch(`/api/core/companies/${company.slug}/`, values)
            } else {
                await api.post("/api/core/companies/", values)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] })
            toast.success(company ? "Empresa atualizada com sucesso" : "Empresa criada com sucesso")
            onOpenChange(false)
        },
        onError: (error: unknown) => {
            const err = error as { response?: { data?: unknown } }
            const data = err.response?.data
            let message = "Erro ao salvar empresa"
            if (data && typeof data === "object") {
                if ("detail" in data && typeof (data as { detail?: unknown }).detail === "string") {
                    message = (data as { detail: string }).detail
                } else if ("slug" in data && Array.isArray((data as { slug?: unknown }).slug)) {
                    const first = (data as { slug: unknown[] }).slug[0]
                    if (typeof first === "string") message = first
                }
            }
            toast.error(message)
        },
        onSettled: () => {
            setIsSubmitting(false)
        }
    })

    function onSubmit(values: CompanyFormValues) {
        setIsSubmitting(true)
        mutation.mutate(values)
    }

    // Auto-generate slug from name if creating new company
    const watchName = form.watch("name")
    useEffect(() => {
        if (!company && watchName) {
            const generatedSlug = watchName
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")

            form.setValue("slug", generatedSlug, { shouldValidate: true })
        }
    }, [watchName, company, form])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[460px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                    <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
                    <DialogDescription>
                        Configure as informações básicas da organização.
                    </DialogDescription>
                </DialogHeader>
                <div className="min-h-0 overflow-y-auto">
                    <div className="px-4 py-4 sm:px-6">
                        <Form {...form}>
                            <form id="company-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Nome da Empresa</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ex: Acme Corp" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="slug"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Slug</FormLabel>
                                            <FormControl>
                                                <Input placeholder="ex: acme-corp" {...field} disabled={!!company} />
                                            </FormControl>
                                            <FormDescription>
                                                Identificador único na URL (ex: atlas.com/acme-corp)
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="domain"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Domínio Customizado (Opcional)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="ex: app.acme.com" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </div>
                </div>
                <DialogFooter className="border-t bg-background/60 px-4 py-4 sm:px-6">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="company-form" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {company ? "Salvar Alterações" : "Criar Empresa"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
