"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { RotateCcw, Clock, User, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
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

interface Version {
    id: number
    created_at: string
    user: string
    comment: string
}

interface ArticleHistoryProps {
    articleSlug: string
}

export function ArticleHistory({ articleSlug }: ArticleHistoryProps) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [selectedVersion, setSelectedVersion] = React.useState<Version | null>(null)
    const [isOpen, setIsOpen] = React.useState(false)

    const { data: versions, isLoading } = useQuery({
        queryKey: ['article-history', articleSlug],
        queryFn: async () => {
            const res = await api.get<Version[]>(`/api/articles/articles/${articleSlug}/history/`)
            return res.data
        },
        enabled: isOpen
    })

    const revertMutation = useMutation({
        mutationFn: async (versionId: number) => {
            await api.post(`/api/articles/articles/${articleSlug}/revert/`, { version_id: versionId })
        },
        onSuccess: () => {
            toast({
                title: "Versão restaurada",
                description: "O artigo foi revertido com sucesso.",
            })
            // I4: usa queryKey sem parâmetros extras para invalidar todas as variantes da query de artigos
            queryClient.invalidateQueries({ queryKey: ['articles'] })
            queryClient.invalidateQueries({ queryKey: ['article-history', articleSlug] })
            setSelectedVersion(null)
            setIsOpen(false)
        },
        onError: () => {
            toast({
                title: "Erro",
                description: "Não foi possível restaurar a versão.",
                variant: "destructive"
            })
        }
    })

    return (
        <>
            <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        Histórico
                    </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[90vw] sm:w-[520px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr]">
                    <SheetHeader className="border-b bg-muted/30 px-4 py-4 text-left">
                        <SheetTitle>Histórico de Versões</SheetTitle>
                        <SheetDescription>
                            Visualize e restaure versões anteriores deste artigo.
                        </SheetDescription>
                    </SheetHeader>

                    <ScrollArea className="h-full px-4 py-4">
                        {isLoading ? (
                            <div className="text-center py-4 text-muted-foreground" role="status" aria-live="polite" aria-label="Carregando histórico do artigo">Carregando...</div>
                        ) : versions?.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">Sem histórico disponível.</div>
                        ) : (
                            <div className="space-y-4">
                                {versions?.map((version) => (
                                    <div
                                        key={version.id}
                                        className="flex flex-col gap-2 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Clock className="h-3 w-3" aria-hidden="true" />
                                                <span>
                                                    {format(new Date(version.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                                                </span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 hover:text-primary"
                                                onClick={() => setSelectedVersion(version)}
                                                title="Restaurar esta versão"
                                                aria-label="Restaurar esta versão"
                                            >
                                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <User className="h-3 w-3" aria-hidden="true" />
                                            <span>{version.user}</span>
                                        </div>

                                        <div className="flex items-start gap-2 text-sm bg-muted p-2 rounded text-muted-foreground">
                                            <MessageCircle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                                            <span>{version.comment || "Sem comentário"}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </SheetContent>
            </Sheet>

            <AlertDialog open={!!selectedVersion} onOpenChange={(open) => !open && setSelectedVersion(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restaurar Versão?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Isso irá reverter o artigo para a versão de{' '}
                            {selectedVersion && format(new Date(selectedVersion.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}.
                            Uma nova versão será criada com o estado atual antes da reversão.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => selectedVersion && revertMutation.mutate(selectedVersion.id)}
                            disabled={revertMutation.isPending}
                        >
                            {revertMutation.isPending ? "Restaurando..." : "Sim, restaurar"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
