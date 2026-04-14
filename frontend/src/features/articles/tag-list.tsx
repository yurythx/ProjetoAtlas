"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Category, Tag } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Hash, FolderTree, Loader2, Pencil } from "lucide-react"
import { notify } from "@/lib/notifications"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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

export function TagList() {
    const queryClient = useQueryClient()
    const [newTagName, setNewTagName] = React.useState("")
    const [newCategoryName, setNewCategoryName] = React.useState("")
    const [debouncedTagName, setDebouncedTagName] = React.useState("")
    const [debouncedCategoryName, setDebouncedCategoryName] = React.useState("")

    const slugify = (s: string) =>
        s
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')

    const { data: tags, isLoading: isLoadingTags, error: tagsError, refetch: refetchTags } = useQuery<Tag[]>({
        queryKey: ['tags'],
        queryFn: async () => {
            const res = await api.get<Tag[] | { results: Tag[] }>('/api/articles/tags/')
            const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
            return Array.isArray(data) ? data : []
        },
        staleTime: 30000,
        refetchOnWindowFocus: false
    })
    const tagsSorted = React.useMemo(
        () => [...(tags ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })),
        [tags]
    )

    const { data: categories, isLoading: isLoadingCategories, error: categoriesError, refetch: refetchCategories } = useQuery<Category[]>({
        queryKey: ['categories'],
        queryFn: async () => {
            const res = await api.get<Category[] | { results: Category[] }>('/api/articles/categories/')
            const data = Array.isArray(res.data) ? res.data : (res.data.results || [])
            return Array.isArray(data) ? data : []
        },
        staleTime: 30000,
        refetchOnWindowFocus: false
    })
    const categoriesSorted = React.useMemo(
        () => [...(categories ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })),
        [categories]
    )

    const existingTagSlugs = React.useMemo(() => new Set((tags ?? []).map(t => t.slug)), [tags])
    const existingCategorySlugs = React.useMemo(() => new Set((categories ?? []).map(c => c.slug)), [categories])
    const isDuplicateTag = React.useMemo(() => {
        const trimmed = debouncedTagName.trim()
        if (!trimmed) return false
        return existingTagSlugs.has(slugify(trimmed))
    }, [debouncedTagName, existingTagSlugs])
    const isDuplicateCategory = React.useMemo(() => {
        const trimmed = debouncedCategoryName.trim()
        if (!trimmed) return false
        return existingCategorySlugs.has(slugify(trimmed))
    }, [debouncedCategoryName, existingCategorySlugs])
    const isTooShortTag = React.useMemo(() => {
        const trimmed = debouncedTagName.trim()
        return trimmed.length > 0 && trimmed.length < 2
    }, [debouncedTagName])
    const isTooShortCategory = React.useMemo(() => {
        const trimmed = debouncedCategoryName.trim()
        return trimmed.length > 0 && trimmed.length < 2
    }, [debouncedCategoryName])
    React.useEffect(() => {
        const h = setTimeout(() => setDebouncedTagName(newTagName), 300)
        return () => clearTimeout(h)
    }, [newTagName])
    React.useEffect(() => {
        const h = setTimeout(() => setDebouncedCategoryName(newCategoryName), 300)
        return () => clearTimeout(h)
    }, [newCategoryName])
    const [editingTag, setEditingTag] = React.useState<{ slug: string; name: string } | null>(null)
    const [editingCategory, setEditingCategory] = React.useState<{ id: number; name: string } | null>(null)
    const [tagToDelete, setTagToDelete] = React.useState<Tag | null>(null)
    const [categoryToDelete, setCategoryToDelete] = React.useState<Category | null>(null)
    const editTagDuplicate = React.useMemo(() => {
        if (!editingTag) return false
        const trimmed = editingTag.name.trim()
        if (!trimmed) return false
        const newSlug = slugify(trimmed)
        return newSlug !== editingTag.slug && existingTagSlugs.has(newSlug)
    }, [editingTag, existingTagSlugs])
    const editTagTooShort = React.useMemo(() => {
        const trimmed = editingTag?.name.trim() ?? ""
        return trimmed.length > 0 && trimmed.length < 2
    }, [editingTag])
    const editCategoryDuplicate = React.useMemo(() => {
        if (!editingCategory) return false
        const trimmed = editingCategory.name.trim()
        if (!trimmed) return false
        const newSlug = slugify(trimmed)
        const current = categoriesSorted.find(c => c.id === editingCategory.id)
        return newSlug !== current?.slug && existingCategorySlugs.has(newSlug)
    }, [editingCategory, existingCategorySlugs, categoriesSorted])
    const editCategoryTooShort = React.useMemo(() => {
        const trimmed = editingCategory?.name.trim() ?? ""
        return trimmed.length > 0 && trimmed.length < 2
    }, [editingCategory])
    const getErrorMessage = (err: unknown, fallback = "Erro desconhecido") => {
        if (typeof err === "string") return err
        if (err && typeof err === "object") {
            const resp = (err as { response?: { data?: unknown } }).response?.data
            if (typeof resp === "string") return resp
            if (resp && typeof resp === "object") {
                const obj = resp as Record<string, unknown>
                if (typeof obj.detail === "string") return obj.detail
                const nfe = obj.non_field_errors
                if (Array.isArray(nfe) && typeof nfe[0] === "string") return nfe[0]
                const keys = Object.keys(obj)
                const firstVal = obj[keys[0]]
                if (typeof firstVal === "string") return firstVal
                if (Array.isArray(firstVal) && typeof firstVal[0] === "string") return firstVal[0]
            }
            const msg = (err as { message?: unknown }).message
            if (typeof msg === "string") return msg
        }
        return fallback
    }

    const createTagMutation = useMutation({
        mutationFn: async (name: string) => {
            const trimmed = name.trim()
            if (trimmed.length < 2) {
                throw new Error("Informe pelo menos 2 caracteres para a tag.")
            }
            const slug = slugify(trimmed)
            if (existingTagSlugs.has(slug)) {
                throw new Error("Tag já existe.")
            }
            return api.post('/api/articles/tags/', { name, slug })
        },
        onMutate: async (name: string) => {
            await queryClient.cancelQueries({ queryKey: ['tags'] })
            const previous = queryClient.getQueryData<Tag[]>(['tags']) ?? []
            const trimmed = name.trim()
            const optimistic: Tag = {
                id: Date.now(),
                name: trimmed,
                slug: slugify(trimmed)
            }
            queryClient.setQueryData<Tag[]>(['tags'], [...previous, optimistic])
            return { previous }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            setNewTagName("")
            notify.success("Tag criada", "A nova tag já pode ser usada em artigos.")
        },
        onError: (err: unknown, _vars, ctx) => {
            if (ctx?.previous) {
                queryClient.setQueryData<Tag[]>(['tags'], ctx.previous)
            }
            notify.error("Erro ao criar tag", getErrorMessage(err, "Falha ao criar tag"))
        }
    })

    const deleteTagMutation = useMutation({
        mutationFn: (slug: string) => api.delete(`/api/articles/tags/${slug}/`),
        onMutate: async (slug: string) => {
            await queryClient.cancelQueries({ queryKey: ['tags'] })
            const previous = queryClient.getQueryData<Tag[]>(['tags']) ?? []
            queryClient.setQueryData<Tag[]>(['tags'], previous.filter(t => t.slug !== slug))
            return { previous }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            notify.success("Tag removida")
        },
        onError: (err: unknown, _vars, ctx) => {
            if (ctx?.previous) {
                queryClient.setQueryData<Tag[]>(['tags'], ctx.previous)
            }
            notify.error("Erro ao remover tag", getErrorMessage(err, "Falha ao remover tag"))
        }
    })
    const updateTagMutation = useMutation({
        mutationFn: async ({ oldSlug, name }: { oldSlug: string; name: string }) => {
            const trimmed = name.trim()
            if (trimmed.length < 2) {
                throw new Error("Informe pelo menos 2 caracteres.")
            }
            const newSlug = slugify(trimmed)
            if (oldSlug !== newSlug && existingTagSlugs.has(newSlug)) {
                throw new Error("Tag já existe.")
            }
            return api.patch(`/api/articles/tags/${oldSlug}/`, { name: trimmed, slug: newSlug })
        },
        onMutate: async ({ oldSlug, name }) => {
            await queryClient.cancelQueries({ queryKey: ['tags'] })
            const previous = queryClient.getQueryData<Tag[]>(['tags']) ?? []
            const trimmed = name.trim()
            const newSlug = slugify(trimmed)
            const next = previous.map(t => (t.slug === oldSlug ? { ...t, name: trimmed, slug: newSlug } : t))
            queryClient.setQueryData<Tag[]>(['tags'], next)
            return { previous }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            setEditingTag(null)
            notify.success("Tag atualizada")
        },
        onError: (err: unknown, _vars, ctx) => {
            if (ctx?.previous) {
                queryClient.setQueryData<Tag[]>(['tags'], ctx.previous)
            }
            notify.error("Erro ao atualizar tag", getErrorMessage(err, "Falha ao atualizar tag"))
        }
    })

    const createCategoryMutation = useMutation({
        mutationFn: async (name: string) => {
            const trimmed = name.trim()
            if (trimmed.length < 2) {
                throw new Error("Informe pelo menos 2 caracteres para a categoria.")
            }
            const slug = slugify(trimmed)
            if (existingCategorySlugs.has(slug)) {
                throw new Error("Categoria já existe.")
            }
            return api.post('/api/articles/categories/', { name, slug })
        },
        onMutate: async (name: string) => {
            await queryClient.cancelQueries({ queryKey: ['categories'] })
            const previous = queryClient.getQueryData<Category[]>(['categories']) ?? []
            const trimmed = name.trim()
            const optimistic: Category = {
                id: Date.now(),
                name: trimmed,
                slug: slugify(trimmed)
            }
            queryClient.setQueryData<Category[]>(['categories'], [...previous, optimistic])
            return { previous }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setNewCategoryName("")
            notify.success("Categoria criada")
        },
        onError: (err: unknown, _vars, ctx) => {
            if (ctx?.previous) {
                queryClient.setQueryData<Category[]>(['categories'], ctx.previous)
            }
            notify.error("Erro ao criar categoria", getErrorMessage(err, "Falha ao criar categoria"))
        }
    })

    const deleteCategoryMutation = useMutation({
        mutationFn: (id: number) => api.delete(`/api/articles/categories/${id}/`),
        onMutate: async (id: number) => {
            await queryClient.cancelQueries({ queryKey: ['categories'] })
            const previous = queryClient.getQueryData<Category[]>(['categories']) ?? []
            queryClient.setQueryData<Category[]>(['categories'], previous.filter(c => c.id !== id))
            return { previous }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            notify.success("Categoria removida")
        },
        onError: (err: unknown, _vars, ctx) => {
            if (ctx?.previous) {
                queryClient.setQueryData<Category[]>(['categories'], ctx.previous)
            }
            notify.error("Erro ao remover categoria", getErrorMessage(err, "Falha ao remover categoria"))
        }
    })
    const updateCategoryMutation = useMutation({
        mutationFn: async ({ id, name }: { id: number; name: string }) => {
            const trimmed = name.trim()
            if (trimmed.length < 2) {
                throw new Error("Informe pelo menos 2 caracteres.")
            }
            const newSlug = slugify(trimmed)
            const current = categoriesSorted.find(c => c.id === id)
            if (current && current.slug !== newSlug && existingCategorySlugs.has(newSlug)) {
                throw new Error("Categoria já existe.")
            }
            return api.patch(`/api/articles/categories/${id}/`, { name: trimmed, slug: newSlug })
        },
        onMutate: async ({ id, name }) => {
            await queryClient.cancelQueries({ queryKey: ['categories'] })
            const previous = queryClient.getQueryData<Category[]>(['categories']) ?? []
            const trimmed = name.trim()
            const newSlug = slugify(trimmed)
            const next = previous.map(c => (c.id === id ? { ...c, name: trimmed, slug: newSlug } : c))
            queryClient.setQueryData<Category[]>(['categories'], next)
            return { previous }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setEditingCategory(null)
            notify.success("Categoria atualizada")
        },
        onError: (err: unknown, _vars, ctx) => {
            if (ctx?.previous) {
                queryClient.setQueryData<Category[]>(['categories'], ctx.previous)
            }
            notify.error("Erro ao atualizar categoria", getErrorMessage(err, "Falha ao atualizar categoria"))
        }
    })

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Tags Section */}
            <Card className="border-none shadow-xl bg-card">
                <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <Hash className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <CardTitle>Tags</CardTitle>
                    </div>
                    <CardDescription>Palavras-chave para organizar seus artigos.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Nova tag..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newTagName) {
                                    if (isDuplicateTag) {
                                        notify.error("Tag já existe")
                                        return
                                    }
                                    createTagMutation.mutate(newTagName)
                                }
                            }}
                            className="bg-background"
                            aria-invalid={isDuplicateTag || isTooShortTag}
                            aria-describedby="tagname-help"
                        />
                        <Button
                            size="icon"
                            disabled={!newTagName || isDuplicateTag || isTooShortTag || createTagMutation.isPending}
                            onClick={() => createTagMutation.mutate(newTagName)}
                            aria-label="Adicionar tag"
                        >
                            {createTagMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                        </Button>
                    </div>
                    {(isDuplicateTag || isTooShortTag) && (
                        <p id="tagname-help" className="text-xs text-destructive" aria-live="polite">
                            {isTooShortTag ? "Informe pelo menos 2 caracteres." : "Tag já existe."}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-2 min-h-[100px] p-4 rounded-xl bg-muted/30 border border-dashed" role="list" aria-label="Lista de tags">
                        {tagsError ? (
                            <div className="w-full text-center space-y-2">
                                <p className="text-xs text-destructive">Erro ao carregar tags.</p>
                                <Button variant="outline" size="sm" onClick={() => refetchTags()}>Tentar novamente</Button>
                            </div>
                        ) : isLoadingTags ? (
                            <div role="status" aria-live="polite" aria-label="Carregando tags">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" aria-hidden="true" />
                            </div>
                        ) : tags?.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center w-full py-8">Nenhuma tag cadastrada.</p>
                        ) : tagsSorted.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center w-full py-8">Nenhuma tag cadastrada.</p>
                        ) : (
                            tagsSorted.map((tag: Tag) => (
                                <div key={tag.id} className="flex items-center gap-2" role="listitem">
                                    {editingTag?.slug === tag.slug ? (
                                        <>
                                            <Input
                                                value={editingTag.name}
                                                onChange={(e) => setEditingTag({ slug: tag.slug, name: e.target.value })}
                                                className="h-8 w-40"
                                                aria-invalid={editTagDuplicate || editTagTooShort}
                                                aria-describedby="edit-tag-help"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !editTagDuplicate && !editTagTooShort) {
                                                        updateTagMutation.mutate({ oldSlug: tag.slug, name: editingTag.name })
                                                    } else if (e.key === 'Escape') {
                                                        setEditingTag(null)
                                                    }
                                                }}
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => updateTagMutation.mutate({ oldSlug: tag.slug, name: editingTag.name })}
                                                disabled={editTagDuplicate || editTagTooShort || updateTagMutation.isPending}
                                                aria-label="Salvar tag"
                                            >
                                                Salvar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingTag(null)}
                                                aria-label="Cancelar edição da tag"
                                            >
                                                Cancelar
                                            </Button>
                                            {(editTagDuplicate || editTagTooShort) && (
                                                <p id="edit-tag-help" className="text-xs text-destructive" aria-live="polite">
                                                    {editTagTooShort ? "Informe pelo menos 2 caracteres." : "Tag já existe."}
                                                </p>
                                            )}
                                        </>
                                    ) : (
                                        <Badge
                                            variant="secondary"
                                            className="pl-3 pr-1 py-1 gap-1 group hover:bg-primary/10 transition-colors"
                                        >
                                            {tag.name}
                                            <button
                                                onClick={() => setEditingTag({ slug: tag.slug, name: tag.name })}
                                                className="ml-1 p-0.5 rounded-full hover:bg-primary hover:text-primary-foreground transition-colors"
                                                aria-label={`Editar tag ${tag.name}`}
                                            >
                                                <Pencil className="h-3 w-3" aria-hidden="true" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setTagToDelete(tag)
                                                }}
                                                className="ml-1 p-0.5 rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
                                                aria-label={`Remover tag ${tag.name}`}
                                                disabled={deleteTagMutation.isPending}
                                            >
                                                <Trash2 className="h-3 w-3" aria-hidden="true" />
                                            </button>
                                        </Badge>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Categories Section */}
            <Card className="border-none shadow-xl bg-card">
                <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <FolderTree className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <CardTitle>Categorias</CardTitle>
                    </div>
                    <CardDescription>Estrutura principal do seu conteúdo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Nova categoria..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && newCategoryName) {
                                    if (isDuplicateCategory) {
                                        notify.error("Categoria já existe")
                                        return
                                    }
                                    createCategoryMutation.mutate(newCategoryName)
                                }
                            }}
                            className="bg-background"
                            aria-invalid={isDuplicateCategory || isTooShortCategory}
                            aria-describedby="categoryname-help"
                        />
                        <Button
                            size="icon"
                            disabled={!newCategoryName || isDuplicateCategory || isTooShortCategory || createCategoryMutation.isPending}
                            onClick={() => createCategoryMutation.mutate(newCategoryName)}
                            aria-label="Adicionar categoria"
                        >
                            {createCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                        </Button>
                    </div>
                    {(isDuplicateCategory || isTooShortCategory) && (
                        <p id="categoryname-help" className="text-xs text-destructive">
                            {isTooShortCategory ? "Informe pelo menos 2 caracteres." : "Categoria já existe."}
                        </p>
                    )}

                    <div className="space-y-2 min-h-[100px]" role="list" aria-label="Lista de categorias">
                        {categoriesError ? (
                            <div className="w-full text-center space-y-2">
                                <p className="text-xs text-destructive">Erro ao carregar categorias.</p>
                                <Button variant="outline" size="sm" onClick={() => refetchCategories()}>Tentar novamente</Button>
                            </div>
                        ) : isLoadingCategories ? (
                            <div role="status" aria-live="polite" aria-label="Carregando categorias">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" aria-hidden="true" />
                            </div>
                        ) : categories?.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center w-full py-8 border border-dashed rounded-xl">Nenhuma categoria cadastrada.</p>
                        ) : categoriesSorted.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center w-full py-8 border border-dashed rounded-xl">Nenhuma categoria cadastrada.</p>
                        ) : (
                            categoriesSorted.map((cat: Category) => (
                                <div
                                    key={cat.id}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border hover:border-primary/30 transition-all group"
                                >
                                    {editingCategory?.id === cat.id ? (
                                        <div className="flex items-center gap-2 w-full">
                                            <Input
                                                value={editingCategory.name}
                                                onChange={(e) => setEditingCategory({ id: cat.id, name: e.target.value })}
                                                className="h-8"
                                                aria-invalid={editCategoryDuplicate || editCategoryTooShort}
                                                aria-describedby="edit-category-help"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !editCategoryDuplicate && !editCategoryTooShort) {
                                                        updateCategoryMutation.mutate({ id: cat.id, name: editingCategory.name })
                                                    } else if (e.key === 'Escape') {
                                                        setEditingCategory(null)
                                                    }
                                                }}
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => updateCategoryMutation.mutate({ id: cat.id, name: editingCategory.name })}
                                                disabled={editCategoryDuplicate || editCategoryTooShort || updateCategoryMutation.isPending}
                                                aria-label="Salvar categoria"
                                            >
                                                Salvar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingCategory(null)}
                                                aria-label="Cancelar edição da categoria"
                                            >
                                                Cancelar
                                            </Button>
                                            {(editCategoryDuplicate || editCategoryTooShort) && (
                                                <p id="edit-category-help" className="text-xs text-destructive" aria-live="polite">
                                                    {editCategoryTooShort ? "Informe pelo menos 2 caracteres." : "Categoria já existe."}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <span className="font-medium">{cat.name}</span>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => setEditingCategory({ id: cat.id, name: cat.name })}
                                                    aria-label={`Editar categoria ${cat.name}`}
                                                >
                                                    <Pencil className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => {
                                                        setCategoryToDelete(cat)
                                                    }}
                                                    aria-label={`Remover categoria ${cat.name}`}
                                                    disabled={deleteCategoryMutation.isPending}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={!!tagToDelete} onOpenChange={(open) => { if (!open) setTagToDelete(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover tag</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A tag será removida e não poderá ser usada em novos artigos.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteTagMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteTagMutation.isPending}
                            onClick={() => {
                                if (!tagToDelete) return
                                deleteTagMutation.mutate(tagToDelete.slug)
                                setTagToDelete(null)
                            }}
                        >
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => { if (!open) setCategoryToDelete(null) }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover categoria</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A categoria será removida permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteCategoryMutation.isPending}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteCategoryMutation.isPending}
                            onClick={() => {
                                if (!categoryToDelete) return
                                deleteCategoryMutation.mutate(categoryToDelete.id)
                                setCategoryToDelete(null)
                            }}
                        >
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
