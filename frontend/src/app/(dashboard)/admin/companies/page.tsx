"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Building2 } from "lucide-react"
import { Company } from "@/types"
import { api } from "@/lib/axios"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import dynamic from "next/dynamic"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
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

const CompanyList = dynamic(
    () => import("@/features/admin/companies/company-list").then((m) => m.CompanyList),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando empresas">
                <Skeleton className="h-10 w-72 rounded-xl" />
                <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
                    <TableSkeleton rows={7} columns={5} />
                </div>
            </div>
        ),
    }
)

const CompanyDialog = dynamic(
    () => import("@/features/admin/companies/company-dialog").then((m) => m.CompanyDialog),
    { ssr: false }
)

export default function CompaniesPage() {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
    const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const queryClient = useQueryClient()

    function handleCreate() {
        setSelectedCompany(null)
        setIsDialogOpen(true)
    }

    function handleEdit(company: Company) {
        setSelectedCompany(company)
        setIsDialogOpen(true)
    }

    function handleDeleteRequest(company: Company) {
        setCompanyToDelete(company)
        setIsDeleteDialogOpen(true)
    }

    async function confirmDelete() {
        if (!companyToDelete) return

        try {
            await api.delete(`/api/core/companies/${companyToDelete.slug}/`)
            queryClient.invalidateQueries({ queryKey: ['admin', 'companies'] })
            toast.success("Empresa excluída com sucesso")
        } catch {
            toast.error("Erro ao excluir empresa")
        } finally {
            setIsDeleteDialogOpen(false)
            setCompanyToDelete(null)
        }
    }

    return (
        <div className="container mx-auto py-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                        <Building2 className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Gerenciamento de Empresas</h1>
                        <p className="text-muted-foreground">Visualize e configure todas as organizações do ecossistema.</p>
                    </div>
                </div>

                <Button onClick={handleCreate} className="shadow-lg shadow-primary/20 transition-all hover:scale-105">
                    <Plus className="mr-2 h-4 w-4" /> Nova Empresa
                </Button>
            </div>

            <CompanyList onEdit={handleEdit} onDelete={handleDeleteRequest} />

            <CompanyDialog
                open={isDialogOpen}
                onOpenChange={setIsDialogOpen}
                company={selectedCompany}
            />

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Isso excluirá permanentemente a empresa
                            <span className="font-bold text-foreground mx-1">{companyToDelete?.name}</span>
                            e removerá todos os dados associados a ela.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Confirmar Exclusão
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
