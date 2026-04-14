"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Plus, Edit, Trash2, Shield, ShieldCheck, MoreVertical } from "lucide-react"
import { useState } from "react"
import { RoleForm } from "./role-form"
import { notify } from "@/lib/notifications"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent } from "@/components/ui/dialog"
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
import { Role } from "@/types"
import { usePermission } from "@/hooks/use-permission"

type RolesResponse = Role[] | { results?: Role[] }

export function RoleList() {
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingRole, setEditingRole] = useState<Role | null>(null)
    const [roleToDelete, setRoleToDelete] = useState<Role | null>(null)
    const queryClient = useQueryClient()
    // I-A4: apenas quem tem permissão pode gerenciar roles
    const { hasPermission } = usePermission()
    const canManageRoles = hasPermission('admin.user_manage')

    const { data: roles, isLoading } = useQuery<Role[]>({
        queryKey: ['roles'],
        queryFn: async ({ signal }) => {
            const res = await api.get<RolesResponse>('/api/accounts/roles/', { signal })
            const payload = res.data as RolesResponse
            if (Array.isArray(payload)) return payload
            return Array.isArray(payload?.results) ? payload.results : []
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/api/accounts/roles/${id}/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['roles'] })
            notify.success("Papel excluído", "O papel foi removido com sucesso.")
        },
        onError: (error) => {
            notify.error("Erro ao excluir papel", error)
        }
    })

    const handleEdit = (role: Role) => {
        setEditingRole(role)
        setIsFormOpen(true)
    }

    const handleAdd = () => {
        setEditingRole(null)
        setIsFormOpen(true)
    }

    if (isLoading) return <div className="p-8 text-center text-muted-foreground" role="status" aria-live="polite" aria-label="Carregando papéis de acesso">Carregando papéis de acesso...</div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Papéis e Acessos</h2>
                    <p className="text-muted-foreground text-sm">Gerencie quem pode fazer o quê no seu ecossistema.</p>
                </div>
                {/* I-A4: apenas quem tem permissão vê o botão de criar */}
                {canManageRoles && (
                    <Button onClick={handleAdd} className="shadow-lg shadow-primary/20">
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Novo Papel
                    </Button>
                )}
            </div>

            <div className="rounded-2xl border bg-card shadow-sm">
                <div className="sm:hidden p-4 space-y-3">
                    {(roles && roles.length > 0) ? (
                        roles.map((role) => (
                            <div key={role.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            {role.is_system_role ? (
                                                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                                            ) : (
                                                <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                            )}
                                            <span className="font-bold truncate">{role.name}</span>
                                            {role.is_system_role && (
                                                <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border-none">Sistema</Badge>
                                            )}
                                        </div>
                                        <div className="mt-1 text-sm text-muted-foreground">
                                            {role.description || "Nenhuma descrição"}
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {Array.isArray(role.permissions) ? `${role.permissions.length} permissões` : "0 permissões"}
                                        </div>
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="shrink-0" aria-label="Abrir menu de ações">
                                                <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                            {canManageRoles ? (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleEdit(role)} className="cursor-pointer">
                                                        <Edit className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> Editar
                                                    </DropdownMenuItem>
                                                    {!role.is_system_role && (
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setRoleToDelete(role)
                                                            }}
                                                            className="text-destructive focus:text-destructive cursor-pointer"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Excluir
                                                        </DropdownMenuItem>
                                                    )}
                                                </>
                                            ) : (
                                                <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                                    Sem permissão
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            Nenhum papel encontrado.
                        </div>
                    )}
                </div>

                <div className="hidden sm:block">
                <Table aria-label="Tabela de papéis e permissões" className="min-w-[820px]">
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="py-4">Nome do Papel</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Permissões</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {roles?.map((role) => (
                            <TableRow key={role.id} className="group hover:bg-muted/30 transition-colors">
                                <TableCell className="py-4">
                                    <div className="flex items-center gap-2">
                                        {role.is_system_role ? (
                                            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                                        ) : (
                                            <Shield className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                        )}
                                        <span className="font-bold">{role.name}</span>
                                        {role.is_system_role && (
                                            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest bg-primary/10 text-primary border-none">Sistema</Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                                    {role.description || "Nenhuma descrição"}
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                        {role.permissions?.slice(0, 3).map((p: string) => (
                                            <Badge key={p} variant="outline" className="text-[10px] bg-background">
                                                {p}
                                            </Badge>
                                        ))}
                                        {role.permissions?.length > 3 && (
                                            <Badge variant="outline" className="text-[10px] bg-background">
                                                +{role.permissions.length - 3}
                                            </Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="group-hover:bg-background" aria-label="Abrir menu de ações">
                                                <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40 rounded-xl">
                                            {/* I-A4: apenas quem tem permissão vê ações de editar/excluir */}
                                            {canManageRoles ? (
                                                <>
                                                    <DropdownMenuItem onClick={() => handleEdit(role)} className="cursor-pointer">
                                                        <Edit className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" /> Editar
                                                    </DropdownMenuItem>
                                                    {!role.is_system_role && (
                                                        <DropdownMenuItem
                                                            onClick={() => {
                                                                setRoleToDelete(role)
                                                            }}
                                                            className="text-destructive focus:text-destructive cursor-pointer"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> Excluir
                                                        </DropdownMenuItem>
                                                    )}
                                                </>
                                            ) : (
                                                <DropdownMenuItem disabled className="text-muted-foreground text-xs">
                                                    Sem permissão
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                </div>
            </div>

            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[620px] max-h-[calc(100vh-1.5rem)] overflow-y-auto overflow-x-hidden rounded-3xl p-0 border-none shadow-2xl">
                    <RoleForm
                        key={editingRole ? `edit-${editingRole.id}` : 'create-new'}
                        initialData={editingRole}
                        onSuccess={() => {
                            setIsFormOpen(false)
                            queryClient.invalidateQueries({ queryKey: ['roles'] })
                        }}
                        onCancel={() => setIsFormOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!roleToDelete} onOpenChange={(open) => { if (!open) setRoleToDelete(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir papel</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Os usuários vinculados permanecerão sem este papel.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                                if (!roleToDelete) return
                                deleteMutation.mutate(roleToDelete.id)
                                setRoleToDelete(null)
                            }}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
