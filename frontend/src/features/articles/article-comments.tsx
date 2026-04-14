"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MessageSquare, Trash2, Send, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useAuth } from "@/hooks/use-auth"

interface Comment {
    id: number
    content: string
    author_name: string
    created_at: string
    is_approved: boolean
    is_public?: boolean
}

interface ArticleCommentsProps {
    articleId: number
}

export function ArticleComments({ articleId }: ArticleCommentsProps) {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const [isOpen, setIsOpen] = React.useState(false)
    const [content, setContent] = React.useState("")
    const [commentToDelete, setCommentToDelete] = React.useState<Comment | null>(null)
    const { user } = useAuth()

    // Bug 10: verifica permissão antes de exibir o formulário de criação
    const canManageComments = !!(
        user?.is_superuser ||
        user?.role_details?.permissions?.includes('*') ||
        user?.role_details?.permissions?.includes('articles.comment_moderate')
    )

    const { data: comments, isLoading } = useQuery({
        queryKey: ['article-comments', articleId],
        queryFn: async () => {
            const res = await api.get<Comment[] | { results: Comment[] }>(`/api/articles/comments/?article=${articleId}`)
            return Array.isArray(res.data) ? res.data : (res.data.results || [])
        },
        enabled: isOpen
    })

    const createMutation = useMutation({
        mutationFn: async (content: string) => {
            await api.post('/api/articles/comments/', { article: articleId, content })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['article-comments', articleId] })
            setContent("")
            toast({ title: "Comentário adicionado" })
        },
        onError: () => {
            toast({ title: "Erro ao adicionar comentário", variant: "destructive" })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/api/articles/comments/${id}/`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['article-comments', articleId] })
            toast({ title: "Comentário removido" })
        },
        onError: () => {
            toast({ title: "Erro ao remover", variant: "destructive" })
        }
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!content.trim()) return
        createMutation.mutate(content)
    }

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    Comentários
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:w-[540px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr]">
                <SheetHeader className="border-b bg-muted/30 px-4 py-4 text-left">
                    <SheetTitle>Comentários do Artigo</SheetTitle>
                    <SheetDescription>
                        Gerencie os comentários e interações deste artigo.
                    </SheetDescription>
                </SheetHeader>

                <div className="min-h-0 p-4 flex flex-col">
                    <div className="mb-4">
                        {/* Bug 10: formulário visível apenas para quem tem permissão article_manage */}
                        {canManageComments ? (
                            <form onSubmit={handleSubmit} className="flex gap-2">
                                <Textarea
                                    placeholder="Adicione um comentário..."
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="resize-none min-h-[80px]"
                                />
                                <Button type="submit" size="icon" className="h-[80px] w-[80px]" disabled={createMutation.isPending} aria-label="Enviar comentário">
                                    <Send className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            </form>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 rounded-lg border border-dashed">
                                <Lock className="h-4 w-4 shrink-0" />
                                <span>Você não tem permissão para adicionar comentários.</span>
                            </div>
                        )}
                    </div>

                    <ScrollArea className="flex-1 pr-4 -mr-4">
                        {isLoading ? (
                            <div className="text-center py-4 text-muted-foreground" role="status" aria-live="polite">Carregando...</div>
                        ) : comments?.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">Nenhum comentário ainda.</div>
                        ) : (
                            <div className="space-y-4 pb-4">
                                {comments?.map((comment: Comment) => (
                                    <div key={comment.id} className="flex gap-4 p-4 rounded-lg border bg-card text-card-foreground shadow-sm">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>{comment.author_name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm">{comment.author_name || 'Anônimo'}</span>
                                                    {comment.is_public && (
                                                        <Badge variant="outline" className="text-[10px]">
                                                            Comentário público
                                                        </Badge>
                                                    )}
                                                    <span className="text-xs text-muted-foreground">
                                                        {format(new Date(comment.created_at), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                                                    </span>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                    onClick={() => setCommentToDelete(comment)}
                                                    aria-label="Excluir comentário"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                            <p className="text-sm text-foreground/90 whitespace-pre-wrap">{comment.content}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </SheetContent>
            <AlertDialog open={!!commentToDelete} onOpenChange={(open) => { if (!open) setCommentToDelete(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover comentário</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O comentário será removido permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                                if (!commentToDelete) return
                                deleteMutation.mutate(commentToDelete.id)
                                setCommentToDelete(null)
                            }}
                        >
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Sheet>
    )
}
