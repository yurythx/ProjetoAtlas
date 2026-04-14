"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Plus, Edit, User as UserIcon, MoreVertical, Shield, ShieldCheck, Mail, Trash2, Building2 } from "lucide-react"
import { useEffect, useState } from "react"
import { UserForm } from "./user-form"
import { InviteForm } from "./invite-form"
import { notify } from "@/lib/notifications"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { CRMGroup, User as UserType, Role as RoleType } from "@/types"
import { useAuth } from "@/hooks/use-auth"
import { usePermission } from "@/hooks/use-permission"

interface UserListProps {
    onEdit?: (user: UserType) => void
    initialDialog?: 'create' | 'invite' | null
}

function parseListResponse<T>(data: unknown): T[] {
    if (Array.isArray(data)) return data as T[]
    if (typeof data === "object" && data !== null && "results" in data) {
        const results = (data as { results?: unknown }).results
        return Array.isArray(results) ? (results as T[]) : []
    }
    return []
}

export function UserList({ onEdit, initialDialog }: UserListProps) {
    const [isUserFormOpen, setIsUserFormOpen] = useState(false)
    const [isInviteFormOpen, setIsInviteFormOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<UserType | null>(null)
    const [userToDelete, setUserToDelete] = useState<UserType | null>(null)
    const [inviteToCancel, setInviteToCancel] = useState<Invite | null>(null)
    const [search, setSearch] = useState("")
    const [roleFilter, setRoleFilter] = useState<string>("all")
    const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active")
    const [crmGroupFilter, setCrmGroupFilter] = useState<string>("all")
    const queryClient = useQueryClient()
    // A8: obter usuário atual via hook (não localStorage)
    const { user: currentUser } = useAuth()
    // I-A4: verificar permissão RBAC para gerenciar equipe
    const { hasPermission } = usePermission()
    const canManageUsers = hasPermission('admin.user_manage')

    interface Invite {
        id: number
        email: string
        role_name: string
        crm_groups?: number[]
        status: 'pending' | 'accepted' | 'expired' | 'canceled'
    }

    const { data: users } = useQuery<UserType[]>({
        queryKey: ['users', search, roleFilter, activeFilter],
        queryFn: async () => {
            const res = await api.get<UserType[] | { results: UserType[] }>('/api/accounts/users/', {
                params: {
                    q: search.trim() || undefined,
                    role: roleFilter !== "all" ? roleFilter : undefined,
                    active: activeFilter === "all" ? undefined : activeFilter === "active" ? "true" : "false",
                },
            })
            return parseListResponse<UserType>(res.data)
        },
        enabled: canManageUsers,
    })

    const { data: invites } = useQuery<Invite[]>({
        queryKey: ['invites'],
        queryFn: async () => {
            const res = await api.get<Invite[] | { results: Invite[] }>('/api/accounts/invitations/')
            const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
            return Array.isArray(data) ? data : []
        },
        enabled: canManageUsers,
    })

    const { data: roles } = useQuery<RoleType[]>({
        queryKey: ['roles'],
        queryFn: async () => {
            const res = await api.get<RoleType[] | { results: RoleType[] }>('/api/accounts/roles/')
            const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
            return Array.isArray(data) ? data : []
        },
        enabled: canManageUsers,
    })

    const safeUsers = Array.isArray(users) ? users : []
    const safeInvites = Array.isArray(invites) ? invites : []
    const safeRoles = Array.isArray(roles) ? roles : []

    const cancelInviteMutation = useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/api/accounts/invitations/${id}/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invites'] })
            notify.success("Convite cancelado")
        }
    })

    const resendInviteMutation = useMutation({
        mutationFn: async (id: number) => {
            await api.post(`/api/accounts/invitations/${id}/resend/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['invites'] })
            notify.success("Convite reenviado")
        },
        onError: (error: unknown) => {
            notify.error("Erro ao reenviar convite", error)
        }
    })

    const deleteUserMutation = useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/api/accounts/users/${id}/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] })
            notify.success("Usuário removido com sucesso")
        },
        onError: (error) => {
            notify.error("Erro ao remover usuário", error)
        }
    })

    const currentUserFormatted = currentUser

    const { data: crmGroups = [] } = useQuery<CRMGroup[]>({
        queryKey: ["crm-groups"],
        queryFn: async () => {
            const res = await api.get<CRMGroup[] | { results: CRMGroup[] }>("/api/crm/groups/")
            return parseListResponse<CRMGroup>(res.data)
        },
        staleTime: 30_000,
        enabled: canManageUsers,
    })

    const crmGroupById = new Map(crmGroups.map((group) => [group.id, group]))

    const filteredUsers = safeUsers.filter((user) => {
        if (crmGroupFilter === "all") return true
        const groupId = Number(crmGroupFilter)
        if (!Number.isFinite(groupId)) return true
        const ids = Array.isArray(user.crm_groups) ? user.crm_groups : []
        return ids.includes(groupId)
    })

    useEffect(() => {
        if (!canManageUsers) return
        if (initialDialog === 'create') {
            setEditingUser(null)
            setIsUserFormOpen(true)
        }
        if (initialDialog === 'invite') {
            setIsInviteFormOpen(true)
        }
    }, [canManageUsers, initialDialog])

    if (!canManageUsers) {
        return (
            <div className="rounded-2xl border bg-card shadow-sm p-10 text-center text-muted-foreground">
                Você não tem permissão para gerenciar usuários.
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Equipe e Membros</h2>
                    <p className="text-muted-foreground text-sm">Gerencie quem tem acesso ao dashboard da sua empresa.</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* I-A4: exibir botões de gerenciamento apenas para quem tem permissão */}
                    {canManageUsers && (
                        <>
                            <Button variant="outline" onClick={() => setIsInviteFormOpen(true)} className="rounded-xl border-primary/20 hover:bg-primary/5">
                                <Mail className="mr-2 h-4 w-4" aria-hidden="true" /> Convidar Membro
                            </Button>
                            <Button onClick={() => { setEditingUser(null); setIsUserFormOpen(true); }} className="shadow-lg shadow-primary/20 rounded-xl">
                                <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar Direto
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="rounded-2xl border bg-card shadow-sm p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nome, username ou email..."
                        className="glass"
                    />
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="glass">
                            <SelectValue placeholder="Papel" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os papéis</SelectItem>
                            {safeRoles.map((role) => (
                                <SelectItem key={role.id} value={String(role.id)}>
                                    {role.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={crmGroupFilter} onValueChange={setCrmGroupFilter}>
                        <SelectTrigger className="glass">
                            <SelectValue placeholder="CRM • Grupo" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os grupos</SelectItem>
                            {crmGroups.map((group) => (
                                <SelectItem key={group.id} value={String(group.id)}>
                                    {group.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as typeof activeFilter)}>
                        <SelectTrigger className="glass">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Ativos</SelectItem>
                            <SelectItem value="inactive">Bloqueados</SelectItem>
                            <SelectItem value="all">Todos</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Tabs defaultValue="active" className="w-full">
                <TabsList className="bg-muted/50 p-1 rounded-xl mb-4">
                    <TabsTrigger value="active" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">
                        Membros ({filteredUsers.length})
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">
                        Convites Pendentes ({safeInvites.filter((i: Invite) => i && i.status === 'pending').length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="active">
                    <div className="rounded-2xl border bg-card shadow-sm">
                        <div className="sm:hidden p-4 space-y-3">
                            {filteredUsers.length > 0 ? filteredUsers.map((user: UserType) => (
                                <div key={user.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-bold truncate">
                                                {user.first_name} {user.last_name}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                @{user.username} · {user.email}
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {user.is_active === false && (
                                                    <Badge variant="destructive" className="rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                        Bloqueado
                                                    </Badge>
                                                )}
                                                {user.is_superuser && (
                                                    <Badge variant="default" className="gap-1.5 bg-indigo-600 text-white border-none rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                                        Superadmin
                                                    </Badge>
                                                )}
                                                {user.role_details ? (
                                                    <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/5 text-primary rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                        <Shield className="h-3 w-3" aria-hidden="true" />
                                                        {user.role_details.name}
                                                    </Badge>
                                                ) : !user.is_superuser && (
                                                    <span className="text-xs text-muted-foreground italic">Sem papel definido</span>
                                                )}
                                                {Array.isArray(user.crm_groups) && user.crm_groups.length > 0 && (
                                                    <Badge variant="secondary" className="rounded-lg text-[10px] font-medium">
                                                        CRM: {user.crm_groups.length}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="mt-2">
                                                {user.company ? (
                                                    <Badge variant="secondary" className="gap-1.5 rounded-lg text-[10px] font-medium">
                                                        <Building2 className="h-3 w-3" aria-hidden="true" />
                                                        {typeof user.company === 'object' ? user.company.name : `Empresa #${user.company}`}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">-</span>
                                                )}
                                            </div>
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" aria-label="Ações do usuário" className="shrink-0">
                                                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                                {canManageUsers && (!user.is_superuser || currentUserFormatted?.is_superuser) && (
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (onEdit) {
                                                                onEdit(user)
                                                            } else {
                                                                setEditingUser(user)
                                                                setIsUserFormOpen(true)
                                                            }
                                                        }}
                                                        className="cursor-pointer"
                                                    >
                                                        <Edit className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> Editar
                                                    </DropdownMenuItem>
                                                )}
                                                {canManageUsers && user.id !== currentUserFormatted?.id && (!user.is_superuser || currentUserFormatted?.is_superuser) && (
                                                    <DropdownMenuItem
                                                        onClick={() => {
                                                            if (confirm("Tem certeza que deseja remover este usuário? Esta ação não pode ser desfeita.")) {
                                                                deleteUserMutation.mutate(user.id)
                                                            }
                                                        }}
                                                        className="text-destructive focus:text-destructive cursor-pointer"
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Remover
                                                    </DropdownMenuItem>
                                                )}
                                                {(!canManageUsers || (user.is_superuser && !currentUserFormatted?.is_superuser)) && (
                                                    <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                                        Acesso Negado
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-10 text-muted-foreground">
                                    Nenhum usuário encontrado para esta empresa.
                                </div>
                            )}
                        </div>

                        <div className="hidden sm:block">
                        <Table aria-label="Tabela de usuários" className="min-w-[900px]">
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="py-4">Usuário</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Papel</TableHead>
                                    <TableHead>Empresa</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredUsers.length > 0 ? filteredUsers.map((user: UserType) => (
                                    <TableRow key={user.id} className="group hover:bg-muted/30 transition-colors">
                                        <TableCell className="py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background shadow-sm">
                                                    <UserIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{user.first_name} {user.last_name}</span>
                                                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{user.email}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                {user.is_active === false && (
                                                    <Badge variant="destructive" className="rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                        Bloqueado
                                                    </Badge>
                                                )}
                                                {user.is_superuser && (
                                                    <Badge variant="default" className="gap-1.5 bg-indigo-600 text-white border-none rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                                        Superadmin
                                                    </Badge>
                                                )}
                                                {user.role_details ? (
                                                    <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/5 text-primary rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                        <Shield className="h-3 w-3" aria-hidden="true" />
                                                        {user.role_details.name}
                                                    </Badge>
                                                ) : !user.is_superuser && (
                                                    <span className="text-xs text-muted-foreground italic">Sem papel definido</span>
                                                )}
                                                {Array.isArray(user.crm_groups) && user.crm_groups.length > 0 && (
                                                    <Badge variant="secondary" className="rounded-lg text-[10px] font-medium">
                                                        CRM: {user.crm_groups
                                                            .slice(0, 2)
                                                            .map((id) => crmGroupById.get(id)?.name)
                                                            .filter(Boolean)
                                                            .join(", ")}
                                                        {user.crm_groups.length > 2 ? ` +${user.crm_groups.length - 2}` : ""}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {user.company ? (
                                                <Badge variant="secondary" className="gap-1.5 rounded-lg text-[10px] font-medium">
                                                    <Building2 className="h-3 w-3" aria-hidden="true" />
                                                    {typeof user.company === 'object' ? user.company.name : `Empresa #${user.company}`}
                                                </Badge>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" aria-label="Ações do usuário">
                                                        <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                                    {/* I-A4: apenas quem tem permissão vê as ações */}
                                                    {/* A6: Apenas superadmin edita superadmin */}
                                                    {canManageUsers && (!user.is_superuser || currentUserFormatted?.is_superuser) && (
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                if (onEdit) {
                                                                    onEdit(user)
                                                                } else {
                                                                    setEditingUser(user);
                                                                    setIsUserFormOpen(true);
                                                                }
                                                            }}
                                                            className="cursor-pointer"
                                                        >
                                                            <Edit className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> Editar
                                                        </DropdownMenuItem>
                                                    )}
                                                    {/* A8: comparar com ID do usuário atual (via useAuth, não localStorage) */}
                                                    {/* A6: Apenas superadmin remove superadmin */}
                                                    {canManageUsers && user.id !== currentUserFormatted?.id && (!user.is_superuser || currentUserFormatted?.is_superuser) && (
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setUserToDelete(user)
                                                            }}
                                                            className="text-destructive focus:text-destructive cursor-pointer"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Remover
                                                        </DropdownMenuItem>
                                                    )}
                                                    {(!canManageUsers || (user.is_superuser && !currentUserFormatted?.is_superuser)) && (
                                                        <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                                            Acesso Negado
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                            Nenhum usuário encontrado para esta empresa.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="pending">
                    <div className="rounded-2xl border bg-card shadow-sm">
                        <div className="sm:hidden p-4 space-y-3">
                            {safeInvites.length > 0 ? safeInvites.map((invite: Invite) => (
                                <div key={invite.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-bold truncate">{invite.email}</div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className="rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                    {invite.role_name}
                                                </Badge>
                                                <Badge variant="secondary" className="capitalize text-[10px] font-bold rounded-lg bg-orange-100 text-orange-700 border-none">
                                                    {invite.status}
                                                </Badge>
                                                {Array.isArray(invite.crm_groups) && invite.crm_groups.length > 0 ? (
                                                    <Badge variant="secondary" className="rounded-lg text-[10px] font-medium">
                                                        CRM: {invite.crm_groups
                                                            .slice(0, 2)
                                                            .map((id) => crmGroupById.get(id)?.name)
                                                            .filter(Boolean)
                                                            .join(", ")}
                                                        {invite.crm_groups.length > 2 ? ` +${invite.crm_groups.length - 2}` : ""}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" aria-label="Ações do convite" className="shrink-0">
                                                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-44 rounded-xl">
                                                <DropdownMenuItem
                                                    onClick={() => resendInviteMutation.mutate(invite.id)}
                                                    className="cursor-pointer"
                                                    disabled={resendInviteMutation.isPending}
                                                >
                                                    <Mail className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> Reenviar
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setInviteToCancel(invite)} className="text-destructive focus:text-destructive cursor-pointer">
                                                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar Convite
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-10 text-muted-foreground">
                                    Nenhum convite pendente.
                                </div>
                            )}
                        </div>

                        <div className="hidden sm:block">
                        <Table aria-label="Tabela de convites" className="min-w-[640px]">
                            <TableHeader className="bg-muted/50">
                                <TableRow>
                                    <TableHead className="py-4">Email</TableHead>
                                    <TableHead>Papel Atribuído</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {safeInvites.map((invite: Invite) => (
                                    <TableRow key={invite.id} className="group hover:bg-muted/30 transition-colors">
                                        <TableCell className="py-4 font-medium">{invite.email}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                <Badge variant="outline" className="rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                                    {invite.role_name}
                                                </Badge>
                                                {Array.isArray(invite.crm_groups) && invite.crm_groups.length > 0 ? (
                                                    <Badge variant="secondary" className="rounded-lg text-[10px] font-medium">
                                                        CRM: {invite.crm_groups
                                                            .slice(0, 2)
                                                            .map((id) => crmGroupById.get(id)?.name)
                                                            .filter(Boolean)
                                                            .join(", ")}
                                                        {invite.crm_groups.length > 2 ? ` +${invite.crm_groups.length - 2}` : ""}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="capitalize text-[10px] font-bold rounded-lg bg-orange-100 text-orange-700 border-none">
                                                {invite.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" aria-label="Ações do convite">
                                                        <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                                    <DropdownMenuItem
                                                        onClick={() => resendInviteMutation.mutate(invite.id)}
                                                        className="cursor-pointer"
                                                        disabled={resendInviteMutation.isPending}
                                                    >
                                                        <Mail className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> Reenviar
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setInviteToCancel(invite)} className="text-destructive focus:text-destructive cursor-pointer">
                                                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar Convite
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {safeInvites.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                            Nenhum convite pendente.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {isUserFormOpen && (
                <UserForm
                    initialData={editingUser}
                    roles={safeRoles}
                    onSuccess={() => {
                        setIsUserFormOpen(false)
                        queryClient.invalidateQueries({ queryKey: ['users'] })
                    }}
                    onCancel={() => setIsUserFormOpen(false)}
                />
            )}

            {isInviteFormOpen && (
                <InviteForm
                    roles={safeRoles}
                    onSuccess={() => {
                        setIsInviteFormOpen(false)
                        queryClient.invalidateQueries({ queryKey: ['invites'] })
                    }}
                    onCancel={() => setIsInviteFormOpen(false)}
                />
            )}

            <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open) setUserToDelete(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover usuário</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O usuário será removido permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteUserMutation.isPending}
                            onClick={() => {
                                if (!userToDelete) return
                                deleteUserMutation.mutate(userToDelete.id)
                                setUserToDelete(null)
                            }}
                        >
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!inviteToCancel} onOpenChange={(open) => { if (!open) setInviteToCancel(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar convite</AlertDialogTitle>
                        <AlertDialogDescription>
                            O convidado não conseguirá mais aceitar este convite.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={cancelInviteMutation.isPending}>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={cancelInviteMutation.isPending}
                            onClick={() => {
                                if (!inviteToCancel) return
                                cancelInviteMutation.mutate(inviteToCancel.id)
                                setInviteToCancel(null)
                            }}
                        >
                            Cancelar convite
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
