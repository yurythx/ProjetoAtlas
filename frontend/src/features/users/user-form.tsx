"use client"

import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { User, Shield, Key, Building2, Mail } from "lucide-react"
import type { User as UserType, Role as RoleType, Company as CompanyType, CRMGroup } from "@/types"
import { useAuth } from "@/hooks/use-auth"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"

function parseListResponse<T>(data: unknown): T[] {
    if (Array.isArray(data)) return data as T[]
    if (typeof data === "object" && data !== null && "results" in data) {
        const results = (data as { results?: unknown }).results
        return Array.isArray(results) ? (results as T[]) : []
    }
    return []
}

const formSchema = z.object({
    username: z.string().min(3, "Username deve ter pelo menos 3 caracteres."),
    email: z.string().email("Email inválido."),
    first_name: z.string().min(1, "Primeiro nome é obrigatório."),
    last_name: z.string().min(1, "Último nome é obrigatório."),
    role: z.string().optional(),
    company: z.string().optional(),
    password: z.string().optional(),
    is_active: z.boolean().optional(),
    crm_groups: z.array(z.number()).optional(),
}).refine(() => {
    // A validação da senha será feita no contexto do formulário (submit)
    // pois não temos acesso ao initialData aqui dentro de forma limpa sem criar factories.
    return true
})

interface UserFormProps {
    initialData?: UserType | null
    roles?: RoleType[]
    onSuccess: () => void
    onCancel: () => void
}

export function UserForm({ initialData, roles, onSuccess, onCancel }: UserFormProps) {
    const queryClient = useQueryClient()
    const { user: me } = useAuth()
    const isSuperuser = me?.is_superuser

    // A6: Proteção extra no form - se o usuário alvo é superadmin e quem edita não é, bloqueia
    const isEditingSuperuserWithoutPermission = initialData?.is_superuser && !isSuperuser

    const { data: companies } = useQuery<CompanyType[]>({
        queryKey: ['companies-list'],
        queryFn: async () => {
            if (!isSuperuser) return []
            const res = await api.get<CompanyType[] | { results: CompanyType[] }>('/api/core/companies/')
            return Array.isArray(res.data) ? res.data : (res.data.results || [])
        },
        enabled: !!isSuperuser
    })

    const { data: crmGroups = [] } = useQuery<CRMGroup[]>({
        queryKey: ['crm-groups'],
        queryFn: async () => {
            const res = await api.get<CRMGroup[] | { results: CRMGroup[] }>('/api/crm/groups/')
            return parseListResponse<CRMGroup>(res.data)
        },
        staleTime: 30_000,
        enabled: !isEditingSuperuserWithoutPermission
    })

    const { data: permissionsCatalog = [] } = useQuery<Array<{ id: string; label: string; description?: string }>>({
        queryKey: ["permissions-catalog"],
        queryFn: async () => {
            const res = await api.get<Array<{ id: string; label: string; description?: string }> | { results: Array<{ id: string; label: string; description?: string }> }>(
                "/api/accounts/roles/permissions/"
            )
            return parseListResponse(res.data)
        },
        staleTime: 60_000,
        enabled: !isEditingSuperuserWithoutPermission
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            username: initialData?.username || "",
            email: initialData?.email || "",
            first_name: initialData?.first_name || "",
            last_name: initialData?.last_name || "",
            role: initialData?.role ? String(initialData.role) : undefined,
            company: initialData?.company ? String(initialData.company) : (me?.company ? String(me.company) : undefined),
            password: "",
            is_active: initialData?.is_active ?? true,
            crm_groups: Array.isArray(initialData?.crm_groups) ? initialData?.crm_groups : [],
        },
    })

    const [sendPasswordSetupEmail, setSendPasswordSetupEmail] = useState(() => !initialData)
    const selectedRoleId = form.watch("role")
    const selectedRole = roles?.find((role) => String(role.id) === selectedRoleId)

    const permissionLabelById = useMemo(() => {
        return new Map(permissionsCatalog.map((item) => [item.id, item.label]))
    }, [permissionsCatalog])

    const selectedRolePermissionsGrouped = useMemo(() => {
        const perms = selectedRole?.permissions || []
        const groups = new Map<string, string[]>()
        perms.forEach((perm) => {
            const category = perm.split(".")[0] || "outros"
            const label = permissionLabelById.get(perm) || perm
            const existing = groups.get(category) || []
            existing.push(label)
            groups.set(category, existing)
        })
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    }, [permissionLabelById, selectedRole?.permissions])

    type UserPayload = {
        username: string
        email: string
        first_name: string
        last_name: string
        role: string | null
        company?: string
        password?: string
        is_active?: boolean
        crm_groups?: number[]
    }

    const mutation = useMutation({
        mutationFn: async (values: z.infer<typeof formSchema>) => {
            // Validação manual de senha para criação
            if (!initialData && !sendPasswordSetupEmail && (!values.password || values.password.length < 8)) {
                form.setError("password", {
                    type: "manual",
                    message: "A senha é obrigatória e deve ter no mínimo 8 caracteres para novos usuários."
                })
                throw new Error("Senha inválida")
            }

            const payload: UserPayload = {
                ...values,
                role: values.role || null,
                company: values.company || undefined,
                crm_groups: values.crm_groups,
                is_active: values.is_active,
            }

            // Remove password validation/field if empty (for edits)
            if (!values.password || sendPasswordSetupEmail) {
                delete payload.password
            }

            if (initialData && initialData.id) {
                await api.patch(`/api/accounts/users/${initialData.id}/`, payload)
            } else {
                await api.post('/api/accounts/users/', payload)
                if (sendPasswordSetupEmail) {
                    try {
                        await api.post('/api/accounts/password-reset/', { email: values.email })
                    } catch (error) {
                        notify.error("Usuário criado, mas falhou o envio do email de definição de senha", error)
                    }
                }
            }
        },
        onSuccess: () => {
            notify.success(initialData ? "Usuário atualizado" : "Membro adicionado")
            queryClient.invalidateQueries({ queryKey: ['users'] })
            queryClient.invalidateQueries({ queryKey: ['roles'] })
            queryClient.invalidateQueries({ queryKey: ['auth', 'user'] })
            onSuccess()
        },
        onError: (error: unknown) => {
            const isPasswordError = typeof error === 'object' && error !== null && (error as { message?: string }).message === "Senha inválida"
            if (!isPasswordError) {
                notify.error("Erro ao salvar usuário", error)
            }
        }
    })

    const passwordResetMutation = useMutation({
        mutationFn: async (email: string) => {
            await api.post('/api/accounts/password-reset/', { email })
        },
        onSuccess: () => {
            notify.success("Link enviado", "Se o email estiver correto, o usuário receberá um link para definir uma nova senha.")
        },
        onError: (error: unknown) => {
            notify.error("Erro ao enviar link", error)
        }
    })

    function onSubmit(values: z.infer<typeof formSchema>) {
        mutation.mutate(values)
    }

    return (
        <Dialog open onOpenChange={onCancel}>
            <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[620px] max-h-[calc(100vh-1.5rem)] overflow-hidden rounded-3xl p-0 border-none shadow-2xl grid grid-rows-[auto_1fr_auto]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <User className="h-6 w-6 text-primary" />
                    </div>
                    <DialogTitle className="text-2xl font-bold">
                        {initialData ? "Editar Membro" : "Novo Membro da Equipe"}
                    </DialogTitle>
                    <DialogDescription>
                        {isEditingSuperuserWithoutPermission
                            ? "Você não tem permissão para editar este usuário administrador global."
                            : "Configure o perfil, empresa e nível de acesso do usuário."}
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 overflow-y-auto">
                    <div className="p-4 sm:p-6">
                        {isEditingSuperuserWithoutPermission ? (
                            <div className="p-8 bg-destructive/10 rounded-2xl border border-destructive/20 text-center space-y-4">
                                <Shield className="h-12 w-12 text-destructive mx-auto opacity-50" />
                                <p className="text-sm font-medium text-destructive">
                                    Acesso restrito. Somente outro Superadmin pode modificar estas configurações.
                                </p>
                            </div>
                        ) : (
                            <Form {...form}>
                                <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                                {/* Superuser Company Selection */}
                                {isSuperuser && (
                                    <div className="p-4 bg-muted/30 rounded-xl border border-muted space-y-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Building2 className="h-4 w-4 text-primary" />
                                            <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Empresa Vinculada</h4>
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="company"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="sr-only">Empresa</FormLabel>
                                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                        <FormControl>
                                                            <SelectTrigger className="bg-background">
                                                                <SelectValue placeholder="Selecione a empresa..." />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            {companies?.map((company: CompanyType) => (
                                                                <SelectItem key={company.id} value={String(company.id)}>
                                                                    {company.name} ({company.slug})
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <FormDescription className="text-xs">
                                                        Este usuário pertencerá exclusivamente a esta empresa.
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="first_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Nome</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="John" className="h-11 rounded-xl" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="last_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Sobrenome</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="Doe" className="h-11 rounded-xl" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="username"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Username</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="john.doe" className="h-11 rounded-xl" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Email</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="john@example.com" className="h-11 rounded-xl" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="rounded-2xl border bg-muted/20 p-4 space-y-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                Estado da Conta
                                            </div>
                                            <div className="mt-1 text-sm font-semibold">
                                                {form.watch("is_active") === false ? "Bloqueado" : "Ativo"}
                                            </div>
                                        </div>
                                        <FormField
                                            control={form.control}
                                            name="is_active"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Switch checked={field.value !== false} onCheckedChange={(checked) => field.onChange(checked)} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {!initialData ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                    Definição de Senha
                                                </div>
                                                <div className="mt-1 text-sm text-muted-foreground">
                                                    {sendPasswordSetupEmail ? "Enviar link por email (recomendado)" : "Definir senha agora"}
                                                </div>
                                            </div>
                                            <Switch checked={sendPasswordSetupEmail} onCheckedChange={setSendPasswordSetupEmail} />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                    Segurança
                                                </div>
                                                <div className="mt-1 text-sm text-muted-foreground">
                                                    Enviar link para redefinir senha (não revela se o email existe).
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="rounded-xl"
                                                disabled={passwordResetMutation.isPending}
                                                onClick={() => {
                                                    const email = form.getValues("email")
                                                    if (!email) return
                                                    passwordResetMutation.mutate(email)
                                                }}
                                            >
                                                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                                                Enviar link
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                {!initialData && sendPasswordSetupEmail ? (
                                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                                        O usuário receberá um email para definir a senha. Garanta que o SMTP esteja configurado.
                                    </div>
                                ) : (
                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                                                    {initialData ? "Nova Senha (Opcional)" : "Senha Provisória (mínimo 8)"}
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="relative">
                                                        <Key className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                                                        <Input
                                                            type="password"
                                                            placeholder={initialData ? "Deixe em branco para manter" : "Defina uma senha segura"}
                                                            className="h-11 rounded-xl pl-10"
                                                            {...field}
                                                        />
                                                    </div>
                                                </FormControl>
                                                <FormDescription className="text-[10px]">
                                                    {initialData
                                                        ? "Preencha apenas se desejar alterar a senha do usuário."
                                                        : "Use uma senha temporária e oriente o usuário a alterar no primeiro acesso."}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                <div className="space-y-4 pt-4 border-t">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Shield className="h-4 w-4 text-primary" />
                                        <h4 className="text-sm font-bold uppercase tracking-widest text-primary">Nível de Acesso</h4>
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem>
                                                <Select
                                                    onValueChange={field.onChange}
                                                    defaultValue={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger className="h-12 rounded-xl bg-muted/20 border-none focus:ring-2 focus:ring-primary/20">
                                                            <SelectValue placeholder="Selecione um papel..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="rounded-xl">
                                                        {roles?.map((role) => (
                                                            <SelectItem key={role.id} value={String(role.id)} className="cursor-pointer">
                                                                <div className="flex flex-col items-start py-1">
                                                                    <span className="font-bold">{role.name}</span>
                                                                    <span className="text-xs text-muted-foreground">{role.description?.substring(0, 50)}...</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormDescription className="text-[10px] mt-2 italic">
                                                    As permissões serão aplicadas imediatamente após salvar.
                                                </FormDescription>
                                                {selectedRole ? (
                                                    <div className="mt-3 rounded-2xl border bg-muted/20 p-3 space-y-3">
                                                        <div>
                                                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                                                Responsabilidade (papel)
                                                            </div>
                                                            <div className="mt-1 text-sm font-semibold">{selectedRole.name}</div>
                                                            <div className="mt-1 text-xs text-muted-foreground">
                                                                {selectedRole.description || "Sem descrição"}
                                                            </div>
                                                            <div className="mt-2 text-xs text-muted-foreground">
                                                                {Array.isArray(selectedRole.permissions)
                                                                    ? `${selectedRole.permissions.length} permissões`
                                                                    : "0 permissões"}
                                                            </div>
                                                        </div>

                                                        {selectedRolePermissionsGrouped.length ? (
                                                            <ScrollArea className="h-[180px] rounded-xl border bg-background/40 p-3">
                                                                <div className="space-y-3 pr-3">
                                                                    {selectedRolePermissionsGrouped.map(([group, items]) => (
                                                                        <div key={group} className="space-y-1.5">
                                                                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                                                                {group}
                                                                            </div>
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {items.map((label) => (
                                                                                    <Badge key={`${group}-${label}`} variant="outline" className="text-[10px] bg-background">
                                                                                        {label}
                                                                                    </Badge>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </ScrollArea>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="pt-4 border-t space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <h4 className="text-sm font-bold uppercase tracking-widest text-primary">CRM • Grupos</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    Define quais pipelines por grupo o usuário poderá visualizar.
                                                </p>
                                            </div>
                                        </div>

                                        <FormField
                                            control={form.control}
                                            name="crm_groups"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="sr-only">Grupos do CRM</FormLabel>
                                                    {crmGroups.length ? (
                                                        <FormControl>
                                                            <ScrollArea className="h-[220px] rounded-2xl border bg-muted/10 p-3">
                                                                <div className="space-y-2 pr-3">
                                                                    {crmGroups.map((group) => {
                                                                        const checked = Array.isArray(field.value) ? field.value.includes(group.id) : false
                                                                        return (
                                                                            <label key={group.id} className="flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2 cursor-pointer">
                                                                                <Checkbox
                                                                                    checked={checked}
                                                                                    onCheckedChange={(value) => {
                                                                                        const next = Boolean(value)
                                                                                        const current = Array.isArray(field.value) ? field.value : []
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
                                    </div>
                                </div>
                                </form>
                            </Form>
                        )}
                    </div>
                </div>

                <div className="border-t bg-background/60 px-4 py-4 sm:px-6 flex justify-end gap-3">
                    <Button variant="ghost" type="button" onClick={onCancel} className="rounded-xl h-11 px-6">
                        {isEditingSuperuserWithoutPermission ? "Voltar" : "Cancelar"}
                    </Button>
                    {!isEditingSuperuserWithoutPermission ? (
                        <Button
                            type="submit"
                            form="user-form"
                            disabled={mutation.isPending}
                            className="rounded-xl h-11 px-8 shadow-lg shadow-primary/20"
                        >
                            {initialData ? "Salvar Alterações" : "Adicionar Membro"}
                        </Button>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    )
}
