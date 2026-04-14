"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { notify } from "@/lib/notifications"
import { Mail, Shield, Loader2 } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { CRMGroup, Role } from "@/types"

const formSchema = z.object({
    email: z.string().email("Email inválido."),
    role: z.string().min(1, "O papel de acesso é obrigatório."),
    crm_groups: z.array(z.number()).optional(),
})

interface InviteFormProps {
    roles?: Role[]
    onSuccess: () => void
    onCancel: () => void
}

function parseListResponse<T>(data: unknown): T[] {
    if (Array.isArray(data)) return data as T[]
    if (typeof data === "object" && data !== null && "results" in data) {
        const results = (data as { results?: unknown }).results
        return Array.isArray(results) ? (results as T[]) : []
    }
    return []
}

export function InviteForm({ roles, onSuccess, onCancel }: InviteFormProps) {
    const { data: crmGroups = [] } = useQuery<CRMGroup[]>({
        queryKey: ['crm-groups'],
        queryFn: async () => {
            const res = await api.get<CRMGroup[] | { results: CRMGroup[] }>('/api/crm/groups/')
            return parseListResponse<CRMGroup>(res.data)
        },
        staleTime: 30_000,
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            role: "",
            crm_groups: [],
        },
    })

    const selectedRoleId = form.watch("role")
    const selectedRole = roles?.find((role) => String(role.id) === selectedRoleId)

    const mutation = useMutation({
        mutationFn: async (values: z.infer<typeof formSchema>) => {
            await api.post('/api/accounts/invitations/', {
                ...values,
                role: parseInt(values.role),
                crm_groups: values.crm_groups || [],
            })
        },
        onSuccess: () => {
            notify.success("Convite enviado!", "O convite foi enviado para o email informado.")
            onSuccess()
        },
        onError: (error: unknown) => {
            notify.error("Erro ao enviar convite", error)
        }
    })

    function onSubmit(values: z.infer<typeof formSchema>) {
        mutation.mutate(values)
    }

    return (
        <Dialog open onOpenChange={onCancel}>
            <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[520px] max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-3xl p-0 border-none shadow-2xl grid grid-rows-[auto_1fr_auto]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <DialogTitle className="text-2xl font-bold">
                        Convidar Membro
                    </DialogTitle>
                    <DialogDescription>
                        O novo membro receberá um link por email para configurar a conta.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 overflow-y-auto">
                    <div className="p-4 sm:p-6">
                        <Form {...form}>
                            <form id="invite-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Endereço de Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="pessoa@exemplo.com" className="h-11 rounded-xl" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="role"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Papel de Acesso</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger className="h-11 rounded-xl bg-muted/20 border-none focus:ring-2 focus:ring-primary/20">
                                                    <SelectValue placeholder="Escolha um nível de acesso..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent className="rounded-xl border-none shadow-xl">
                                                {roles?.map((role) => (
                                                    <SelectItem key={role.id} value={String(role.id)} className="cursor-pointer">
                                                        {role.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormDescription className="text-[10px] italic flex items-center gap-1 mt-2">
                                            <Shield className="h-3 w-3" /> As permissões do papel serão aplicadas automaticamente.
                                        </FormDescription>
                                        {selectedRole ? (
                                            <div className="mt-3 rounded-2xl border bg-muted/20 p-3">
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                    Resumo do papel
                                                </div>
                                                <div className="mt-2 text-sm font-semibold">{selectedRole.name}</div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {selectedRole.description || "Sem descrição"}
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    {Array.isArray(selectedRole.permissions) ? `${selectedRole.permissions.length} permissões` : "0 permissões"}
                                                </div>
                                            </div>
                                        ) : null}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="crm_groups"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                                            CRM • Grupos (opcional)
                                        </FormLabel>
                                        <FormDescription className="text-xs">
                                            Define quais pipelines por grupo o usuário poderá visualizar ao aceitar o convite.
                                        </FormDescription>
                                        {crmGroups.length ? (
                                            <FormControl>
                                                <ScrollArea className="h-[200px] rounded-2xl border bg-muted/10 p-3">
                                                    <div className="space-y-2 pr-3">
                                                        {crmGroups.map((group) => {
                                                            const current = Array.isArray(field.value) ? field.value : []
                                                            const checked = current.includes(group.id)
                                                            return (
                                                                <label key={group.id} className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2 cursor-pointer">
                                                                    <Checkbox
                                                                        checked={checked}
                                                                        onCheckedChange={(value) => {
                                                                            const next = Boolean(value)
                                                                            const updated = next
                                                                                ? (current.includes(group.id) ? current : [...current, group.id])
                                                                                : current.filter((id) => id !== group.id)
                                                                            field.onChange(updated)
                                                                        }}
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="text-sm font-semibold truncate">{group.name}</div>
                                                                        <div className="text-xs text-muted-foreground truncate">{group.slug}</div>
                                                                    </div>
                                                                </label>
                                                            )
                                                        })}
                                                    </div>
                                                </ScrollArea>
                                            </FormControl>
                                        ) : (
                                            <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                                                Nenhum grupo de CRM foi criado ainda.
                                            </div>
                                        )}
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            </form>
                        </Form>
                    </div>
                </div>

                <div className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-3">
                    <Button variant="ghost" type="button" onClick={onCancel} className="rounded-xl h-11 px-6 font-semibold">
                        Sair
                    </Button>
                    <Button
                        type="submit"
                        form="invite-form"
                        disabled={mutation.isPending}
                        className="rounded-xl h-11 px-8 shadow-lg shadow-primary/20 font-bold min-w-[140px]"
                    >
                        {mutation.isPending ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...
                            </>
                        ) : "Enviar Convite"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
