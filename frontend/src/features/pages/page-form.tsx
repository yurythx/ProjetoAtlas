"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Page } from "@/types"
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
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import dynamic from "next/dynamic"
const RichEditor = dynamic(() => import("@/components/ui/rich-editor").then(m => m.RichEditor), { ssr: false, loading: () => <div className="h-64 flex items-center justify-center border rounded-md"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> })
import { PreviewDialog } from "@/components/cms/preview-dialog"
import { Loader2, ArrowLeft, Layout, Globe, Sparkles, CheckCircle2 } from "lucide-react"
import { notify } from "@/lib/notifications"


const formSchema = z.object({
    title: z.string().min(3, "O título deve ter pelo menos 3 caracteres."),
    slug: z.string().min(3, "O link permanente deve ter pelo menos 3 caracteres.").regex(/^[a-z0-9-]+$/, "O link deve conter apenas letras minúsculas, números e hífens."),
    content: z.string().min(10, "O conteúdo deve ter pelo menos 10 caracteres."),
    is_active: z.boolean(),
    meta_title: z.string().max(70, "O título SEO deve ter no máximo 70 caracteres.").optional(),
    meta_description: z.string().max(160, "A descrição SEO deve ter no máximo 160 caracteres.").optional(),
    meta_keywords: z.string().optional(),
})

interface PageFormProps {
    initialData?: Page | null
    onSuccess: () => void
    onCancel: () => void
}

export function PageForm({ initialData, onSuccess, onCancel }: PageFormProps) {
    const queryClient = useQueryClient()

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: initialData?.title || "",
            slug: initialData?.slug || "",
            content: initialData?.content || "",
            is_active: initialData?.status === 'published',
            meta_title: initialData?.meta_title || "",
            meta_description: initialData?.meta_description || "",
            meta_keywords: initialData?.meta_keywords || "",
        },
    })

    const watchedTitle = useWatch({ control: form.control, name: "title" })
    const watchedContent = useWatch({ control: form.control, name: "content" })

    const mutation = useMutation({
        mutationFn: async (values: z.infer<typeof formSchema>) => {
            const payload = { ...values, status: values.is_active ? 'published' : 'draft' };
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { is_active, ...finalPayload } = payload;

            if (initialData) {
                await api.put(`/api/pages/${initialData.id}/`, finalPayload)
            } else {
                await api.post('/api/pages/', finalPayload)
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pages'] })
            notify.success(initialData ? "Página atualizada" : "Página criada", "As alterações foram salvas com sucesso.")
            onSuccess()
        },
        onError: (error) => {
            notify.error("Erro ao salvar página", error)
        }
    })



    function onSubmit(values: z.infer<typeof formSchema>) {
        mutation.mutate(values)
    }

    return (
        <div className="space-y-6">
            {/* Header Fixo/Sticky no mobile */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-6 sticky top-0 bg-background z-10 pt-2">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={onCancel} className="hover:bg-primary/10 hover:text-primary" aria-label="Voltar">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">
                            {initialData ? "Editar Página" : "Nova Página"}
                        </h2>
                        <p className="text-sm text-muted-foreground hidden sm:block">Gerencie páginas institucionais e landing pages.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex-1 sm:flex-initial">
                        <PreviewDialog
                            type="page"
                            title={watchedTitle}
                            content={watchedContent}
                        />
                    </div>
                    <Button onClick={form.handleSubmit(onSubmit)} disabled={mutation.isPending} className="flex-1 sm:flex-initial shadow-lg shadow-primary/20">
                        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                        {initialData ? "Salvar" : "Criar Página"}
                    </Button>
                </div>
            </div>

            <Form {...form}>
                <form className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-20">
                    <div className="lg:col-span-2 space-y-8">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-base font-semibold">Título da Página</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Sobre Nós, Contato, etc." className="text-xl font-bold h-12 px-4 shadow-sm" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="content"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-base font-semibold">Conteúdo Rico</FormLabel>
                                    <FormControl>
                                        <RichEditor
                                            content={field.value}
                                            onChange={field.onChange}
                                            placeholder="Construa o conteúdo da sua página aqui..."
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="pt-8 space-y-6">
                            <div className="flex items-center gap-2 border-b pb-2">
                                <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
                                <h3 className="text-lg font-bold">SEO & Meta Tags</h3>
                            </div>

                            <div className="grid grid-cols-1 gap-6 p-6 rounded-2xl bg-muted/30 border">
                                <FormField
                                    control={form.control}
                                    name="meta_title"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">Título SEO</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Título otimizado para buscadores" className="bg-background h-11" {...field} />
                                            </FormControl>
                                            <FormDescription className="text-xs">Recomendado: até 70 caracteres.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="meta_description"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-semibold">Descrição SEO (Meta Description)</FormLabel>
                                            <FormControl>
                                                <Textarea placeholder="Breve resumo do que o usuário encontrará nesta página." className="bg-background h-24 resize-none" {...field} />
                                            </FormControl>
                                            <FormDescription className="text-xs">Recomendado: até 160 caracteres.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 border-b pb-2">
                                <Layout className="h-5 w-5 text-primary" />
                                <h3 className="text-lg font-bold">Configurações</h3>
                            </div>

                            <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10 space-y-6">
                                <FormField
                                    control={form.control}
                                    name="is_active"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value}
                                                    onCheckedChange={field.onChange}
                                                    className="h-5 w-5"
                                                />
                                            </FormControl>
                                            <div className="space-y-1 leading-none">
                                                <FormLabel className="text-sm font-bold">Página Ativa</FormLabel>
                                                <p className="text-xs text-muted-foreground">Torna a página visível no site.</p>
                                            </div>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="slug"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">URL Amigável (Slug)</FormLabel>
                                            <FormControl>
                                                <div className="relative">
                                                    <Input placeholder="caminho-da-url" className="h-11 bg-background font-mono text-sm" {...field} />
                                                </div>
                                            </FormControl>
                                            <FormDescription className="text-[10px]">Ex: atlas.io/nome-da-pagina</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        <div className="p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-background to-background border border-primary/20 relative overflow-hidden group">
                            <Sparkles className="absolute -right-4 -top-4 h-24 w-24 text-primary/5 group-hover:text-primary/10 transition-colors" />

                            <h4 className="text-sm font-bold flex items-center gap-2 mb-4">
                                <Sparkles className="h-4 w-4 text-primary" />
                                Dicas de Conversão
                            </h4>

                            <ul className="space-y-3">
                                {[
                                    "Use títulos chamativos (H1).",
                                    "Mantenha parágrafos curtos.",
                                    "Adicione CTAs claros.",
                                    "Otimize imagens para web."
                                ].map((tip, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                                        {tip}
                                    </li>
                                ))}
                            </ul>

                            <Button variant="link" className="p-0 h-auto text-xs mt-6 text-primary hover:text-primary/80" type="button">
                                Ver Central de Ajuda
                            </Button>
                        </div>
                    </div>
                </form>
            </Form>
        </div>
    )
}
