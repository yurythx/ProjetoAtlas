"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Article, Category } from "@/types"
import { useDebounce } from "@/hooks/use-debounce"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, Eye, Calendar, Clock, Image as ImageIcon, MessageSquare, Search, Filter, X, Sparkles, BookOpen, User, ArrowUpRight, Download } from "lucide-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import Link from "next/link"
import { VisibilityBadge } from "@/components/articles/visibility-badge"
import { notify } from "@/lib/notifications"
import { fixImageUrl } from "@/lib/utils"
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
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import dynamic from "next/dynamic"

const ExportModal = dynamic(
  () => import("@/components/reports/export-modal").then((m) => m.ExportModal),
  { ssr: false }
)

interface ArticleListProps {
  onEdit: (article: Article) => void
  onCreate: () => void
}

export function ArticleList({ onEdit, onCreate }: ArticleListProps) {
  const queryClient = useQueryClient()
  const [articleToDelete, setArticleToDelete] = React.useState<Article | null>(null)
  const [exportOpen, setExportOpen] = React.useState(false)

  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounce(search, 500)
  const [selectedCategory, setSelectedCategory] = React.useState<string>("all")

  const { data: articles, isLoading } = useQuery({
    queryKey: ['articles', debouncedSearch, selectedCategory],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.append('search', debouncedSearch)
      if (selectedCategory !== 'all') params.append('category', selectedCategory)
      const res = await api.get<{ results?: Article[] } | Article[]>('/api/articles/articles/', { params, signal })
      return (Array.isArray(res.data) ? res.data : ((res.data as { results?: Article[] }).results ?? [])) as Article[]
    }
  })

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<{ results?: Category[] } | Category[]>('/api/articles/categories/')
      return (Array.isArray(res.data) ? res.data : ((res.data as { results?: Category[] }).results ?? [])) as Category[]
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      await api.delete(`/api/articles/articles/${encodeURIComponent(slug)}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      notify.success("Artigo removido", "O conteúdo foi excluído com sucesso.")
    },
    onError: (error: unknown) => {
      notify.error("Falha ao excluir artigo", error)
    }
  })

  const getCategoryName = (id: number | null) => {
    if (!id || !categories) return "Geral"
    return categories.find((c) => c.id === id)?.name || "Geral"
  }

  const getReadingTime = (content?: string) => {
    if (!content) return '1 min'
    const words = content.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length
    const minutes = Math.max(1, Math.round(words / 200))
    return `${minutes} min`
  }

  const statusBadge = (status?: string) => {
    switch (status) {
      case 'published': return { label: 'Publicado', variant: 'default' as const, color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-emerald-500/10' }
      case 'pending': return { label: 'Revisão', variant: 'secondary' as const, color: 'bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-amber-500/10' }
      case 'rejected': return { label: 'Rejeitado', variant: 'destructive' as const, color: 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-rose-500/10' }
      default: return { label: 'Rascunho', variant: 'secondary' as const, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20 shadow-slate-500/10' }
    }
  }

  return (
    <div className="space-y-12 animate-in fade-in duration-1000 relative pb-24">
      {/* Cinematic Background Accents */}
      <div className="absolute -top-60 -right-60 h-[800px] w-[800px] bg-primary/10 blur-[160px] rounded-full pointer-events-none opacity-40 animate-pulse" />
      <div className="absolute -bottom-60 -left-60 h-[800px] w-[800px] bg-blue-600/5 blur-[160px] rounded-full pointer-events-none opacity-40" />

      {/* Elite Hero Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group overflow-hidden bg-white/5 backdrop-blur-3xl p-12 md:p-20 rounded-[4rem] border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col xl:flex-row xl:items-center justify-between gap-12 transition-all hover:border-white/20"
      >
         <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12 pointer-events-none">
            <BookOpen className="h-64 w-64 text-primary" />
         </div>
         <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4">
               <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-xl">
                  <BookOpen className="h-7 w-7 text-primary" />
               </div>
               <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-primary">Intelligence Hub</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Knowledge Management System v5</p>
               </div>
            </div>
            <div className="space-y-2">
                <h2 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.85] italic bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-500">Blog & <span className="text-primary not-italic">Artigos</span></h2>
                <p className="text-slate-400 text-lg font-bold max-w-xl leading-relaxed uppercase tracking-tight opacity-80">Orquestre sua estratégia de conteúdo com a elite do gerenciamento editorial Atlas.</p>
            </div>
         </div>
         <div className="relative z-10 shrink-0 flex items-center gap-4">
            <Button
                variant="outline"
                onClick={() => setExportOpen(true)}
                className="h-14 px-8 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 font-black uppercase tracking-widest text-[10px] flex items-center gap-3 transition-all"
            >
               <Download className="h-4 w-4 text-primary" /> Exportar
            </Button>
            <Button
                onClick={onCreate}
                className="h-20 px-14 rounded-3xl bg-primary text-white font-black uppercase tracking-[0.2em] text-[11px] shadow-[0_20px_40px_-10px_rgba(59,130,246,0.5)] transition-all hover:scale-105 active:scale-95 flex items-center gap-4 group/btn"
            >
               <Plus className="h-6 w-6 group-hover/btn:rotate-90 transition-transform" /> Novo Artigo Atlas
            </Button>
         </div>
      </motion.div>

      {/* Filter Engine Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-white/5 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/10 shadow-2xl">
        <div className="md:col-span-2 relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-all group-focus-within:scale-110" />
          <Input
            placeholder="PESQUISAR NO ÍNDICE EDITORIAL..."
            className="pl-14 h-16 rounded-[1.5rem] border-white/5 bg-white/5 hover:bg-white/10 focus:bg-white/10 transition-all font-black text-xs uppercase tracking-widest shadow-inner placeholder:text-slate-700"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-16 rounded-[1.5rem] border-white/5 bg-white/5 hover:bg-white/10 font-black text-xs uppercase tracking-widest px-8 shadow-inner transition-all">
              <div className="flex items-center gap-4">
                <Filter className="h-5 w-5 text-primary opacity-40" />
                <SelectValue placeholder="CATEGORIA" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-[2rem] border-white/10 bg-slate-900/95 backdrop-blur-3xl text-white">
              <SelectItem value="all" className="rounded-xl font-black uppercase text-[10px] h-12">Todas as Categorias</SelectItem>
              {categories?.map((cat: Category) => (
                <SelectItem key={cat.id} value={String(cat.id)} className="rounded-xl font-black uppercase text-[10px] h-12">{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(search || selectedCategory !== 'all') && (
          <Button
            variant="ghost"
            onClick={() => { setSearch(""); setSelectedCategory("all"); }}
            className="h-16 rounded-[1.5rem] font-black uppercase tracking-widest text-[11px] hover:bg-rose-500/10 hover:text-rose-500 transition-all group/clear"
          >
            <X className="mr-3 h-5 w-5 group-hover/clear:rotate-90 transition-transform" /> Limpar Filtros
          </Button>
        )}
      </div>

      {/* Article Grid Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[560px] rounded-[3.5rem] bg-white/5 animate-pulse border border-white/5 shadow-2xl" />
          ))
        ) : articles?.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="col-span-full flex flex-col items-center justify-center py-40 text-center space-y-8 bg-white/5 rounded-[4rem] border border-dashed border-white/10 backdrop-blur-3xl shadow-2xl"
          >
            <div className="h-28 w-28 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_40px_rgba(59,130,246,0.2)]">
              <ImageIcon className="h-12 w-12 text-primary opacity-30" />
            </div>
            <div className="space-y-3">
              <h3 className="text-3xl font-black tracking-tighter uppercase leading-none">Índice Vazio</h3>
              <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.3em]">O orquestrador de conteúdo aguarda seu primeiro sinal.</p>
            </div>
            <Button onClick={onCreate} variant="outline" className="h-14 px-10 rounded-2xl font-black uppercase tracking-widest text-[11px] border-white/10 bg-white/5 hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-95">Criar Primeiro Artigo</Button>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {articles?.map((article, index) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05, ease: "easeOut" }}
                className="group flex flex-col bg-white/5 border border-white/5 rounded-[3.5rem] overflow-hidden shadow-2xl hover:shadow-[0_48px_96px_-24px_rgba(0,0,0,0.6)] hover:border-primary/30 hover:-translate-y-3 transition-all duration-700 relative"
              >
                {/* Image Cover Layer */}
                <div className="relative aspect-[16/11] overflow-hidden bg-slate-900">
                  {article.cover_image || article.image ? (
                    <Image
                      src={fixImageUrl(article.cover_image || article.image) ?? ""}
                      alt={article.title || "Capa"}
                      fill
                      className="object-cover transition-transform duration-1000 group-hover:scale-110 group-hover:brightness-50"
                      unoptimized
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full w-full bg-gradient-to-br from-slate-950 to-blue-900/20">
                      <ImageIcon className="h-16 w-16 text-primary opacity-10 group-hover:scale-125 transition-transform duration-700" />
                    </div>
                  )}
                  
                  {/* Badges Stack */}
                  <div className="absolute top-8 right-8 flex flex-col gap-3 z-10">
                    <div className={cn("px-5 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-[0.2em] shadow-2xl backdrop-blur-3xl", statusBadge(article.status).color)}>
                      {statusBadge(article.status).label}
                    </div>
                    <div className="shadow-2xl backdrop-blur-3xl rounded-2xl">
                        <VisibilityBadge isPublic={article.is_public ?? false} />
                    </div>
                  </div>

                  {/* Actions Matrix Layer */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-700 flex items-center justify-center gap-4 backdrop-blur-sm">
                    <Button 
                        size="icon" 
                        variant="outline" 
                        className="rounded-2xl h-14 w-14 border-white/20 bg-white/5 text-white hover:bg-primary hover:text-white hover:border-primary transition-all hover:scale-110 shadow-2xl" 
                        onClick={() => onEdit(article)}
                    >
                      <Pencil className="h-6 w-6" />
                    </Button>
                    <Button 
                        size="icon" 
                        variant="outline" 
                        className="rounded-2xl h-14 w-14 border-rose-500/20 bg-rose-500/20 text-rose-500 hover:bg-rose-600 hover:text-white transition-all hover:scale-110 shadow-2xl" 
                        onClick={() => setArticleToDelete(article)}
                    >
                      <Trash2 className="h-6 w-6" />
                    </Button>
                    {article.status === 'published' && (article.is_public ?? false) && (
                      <Link href={{ pathname: `/p/artigos/${article.slug}`, query: { company_slug: article.company_slug || undefined } }} target="_blank">
                        <Button size="icon" className="rounded-2xl h-14 w-14 bg-white text-black hover:bg-primary hover:text-white transition-all hover:scale-110 shadow-2xl">
                          <Eye className="h-6 w-6" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Content Core Architecture */}
                <div className="flex flex-col flex-1 p-10 space-y-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                      <Badge variant="outline" className="h-7 px-4 rounded-xl border-primary/20 bg-primary/5 text-primary font-black uppercase text-[9px] tracking-widest shadow-sm">
                        {typeof article.category === 'object' && article.category !== null
                          ? (article.category as { name?: string }).name
                          : getCategoryName(Number(article.category))}
                      </Badge>
                      <span className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        {article.created_at ? format(new Date(article.created_at), "dd MMM, yyyy", { locale: ptBR }) : '-'}
                      </span>
                    </div>
                    
                    <h3 className="text-3xl font-black leading-[0.9] tracking-tighter uppercase group-hover:text-primary transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-sm text-slate-400 font-bold leading-relaxed line-clamp-3 uppercase tracking-tighter opacity-60">
                      {article.excerpt || "Otimizado para leitura, este conteúdo aguarda sua exploração nas camadas de conhecimento Atlas..."}
                    </p>
                  </div>

                  {/* Operational Footer Meta */}
                  <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-xs font-black text-primary shadow-xl group-hover:scale-110 transition-transform">
                        {(article.author_name || 'A')[0].toUpperCase()}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground/80">{article.author_name || 'System Admin'}</p>
                        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground/30">Protocol Author</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                        <MessageSquare className="h-3 w-3 text-primary/40" /> 
                        <span className="tabular-nums">{Number(article.comment_count ?? 0)}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                        <Clock className="h-3 w-3 text-primary/40" /> 
                        <span className="tabular-nums">{getReadingTime(article.content)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <AlertDialog open={!!articleToDelete} onOpenChange={(open) => { if (!open) setArticleToDelete(null) }}>
        <AlertDialogContent className="rounded-[4rem] border-white/10 bg-slate-950/80 backdrop-blur-3xl p-12 shadow-[0_64px_128px_-32px_rgba(0,0,0,0.8)]">
          <AlertDialogHeader className="space-y-6">
            <div className="h-20 w-20 rounded-[2rem] bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 shadow-2xl shadow-rose-500/10 mb-2">
               <Trash2 className="h-10 w-10" />
            </div>
            <div className="space-y-2">
                <AlertDialogTitle className="text-4xl font-black tracking-tighter uppercase leading-none">Desindexar Artigo</AlertDialogTitle>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Protocolo de Exclusão Irreversível</p>
            </div>
            <AlertDialogDescription className="text-lg font-bold text-slate-400 leading-relaxed uppercase tracking-tight">
              Você está prestes a desindexar permanentemente este conteúdo da base de dados Atlas. Esta ação removerá todos os vestígios do artigo, comentários e telemetria associada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-12 gap-4">
            <AlertDialogCancel disabled={deleteMutation.isPending} className="h-16 px-10 rounded-2xl font-black uppercase tracking-widest text-xs border-white/10 bg-white/5 hover:bg-white/10 transition-all">Cancelar Missão</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!articleToDelete) return
                deleteMutation.mutate(articleToDelete.slug)
                setArticleToDelete(null)
              }}
              className="h-16 px-12 rounded-2xl bg-rose-600 text-white hover:bg-rose-700 font-black uppercase tracking-widest text-xs shadow-2xl shadow-rose-600/30 active:scale-95 transition-all border-none"
            >
              Confirmar Purga
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} reportType="articles" />
    </div>
  )
}
