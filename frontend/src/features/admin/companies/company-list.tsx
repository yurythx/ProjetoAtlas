"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Company } from "@/types"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Edit2, ExternalLink, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"

interface CompanyListProps {
    onEdit: (company: Company) => void
    onDelete: (company: Company) => void
}

export function CompanyList({ onEdit, onDelete }: CompanyListProps) {
    const { data: companies, isLoading } = useQuery<Company[]>({
        queryKey: ['admin', 'companies'],
        queryFn: async () => {
            const res = await api.get<Company[] | { results: Company[] }>('/api/core/companies/')
            return Array.isArray(res.data) ? res.data : res.data.results
        }
    })

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-[250px]" />
                            <Skeleton className="h-4 w-[200px]" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Domínio</TableHead>
                        <TableHead>Criado em</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {companies?.map((company) => (
                        <TableRow key={company.id}>
                            <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={company.theme_branding?.logo_url || undefined} alt={company.name} />
                                        <AvatarFallback>{company.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col">
                                        <span className="font-semibold">{company.name}</span>
                                        {company.onboarding_completed ? (
                                            <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider">Ativo</span>
                                        ) : (
                                            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Em Onboarding</span>
                                        )}
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{company.slug}</TableCell>
                            <TableCell>
                                {company.domain ? (
                                    <a
                                        href={`https://${company.domain}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-primary hover:underline"
                                    >
                                        {company.domain}
                                        <ExternalLink className="h-3 w-3" />
                                    </a>
                                ) : (
                                    <span className="text-muted-foreground text-xs italic">Não configurado</span>
                                )}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                                {format(new Date(company.created_at), "dd 'de' MMM, yyyy", { locale: ptBR })}
                            </TableCell>
                            <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="icon" onClick={() => onEdit(company)}>
                                        <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(company)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                    {companies?.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                Nenhuma empresa encontrada.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
