"use client"

import * as React from "react"
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { Send, Loader2, Paperclip, FileIcon, Download, X, ImageIcon, Check, CheckCheck, SmilePlus, Reply, ArrowLeft, MoreVertical, Trash2, Copy, Pencil, Bell, BellOff, Ban, Mail, Phone, Pin, Archive, Info, Sparkles, MessageSquare, History } from "lucide-react"
import { api } from "@/lib/axios"
import { Contact, User } from "@/types"
import { Conversation, Message, MessageReaction } from "@/types/messenger"
import {
  fetchAndUpsertConversation,
  removeConversation,
  updateArchivedCache,
  updateConversation,
  updateConversationsCache,
  updateDeletedCache,
  upsertConversation,
} from "./cache/conversations"
import { useChat } from "@/hooks/use-chat"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { usePresence } from "@/hooks/use-presence"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { LinkPreview } from "./link-preview"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"

interface ChatWindowProps {
  contact: Contact;
  currentUser: User | null;
  onBack?: () => void;
  conversationId?: number | null;
}

export function ChatWindow({ contact, currentUser, onBack, conversationId }: ChatWindowProps) {
  const [messageInput, setMessageInput] = React.useState("")
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [isDragging, setIsDragging] = React.useState(false)
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null)
  const [editingMessage, setEditingMessage] = React.useState<Message | null>(null)
  const [messageToDelete, setMessageToDelete] = React.useState<Message | null>(null)
  const [messageToInspect, setMessageToInspect] = React.useState<Message | null>(null)
  const [isConversationDeleteOpen, setIsConversationDeleteOpen] = React.useState(false)
  const [isConversationClearOpen, setIsConversationClearOpen] = React.useState(false)
  const [isConversationArchiveOpen, setIsConversationArchiveOpen] = React.useState(false)
  const [lightboxOpen, setLightboxOpen] = React.useState(false)
  const [lightboxIndex, setLightboxIndex] = React.useState(0)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [isMuted, setIsMuted] = React.useState(false)
  const [isPinned, setIsPinned] = React.useState(false)
  const { userStatuses, onlineUsers } = usePresence()

  const { data: blocks } = useQuery<{ id: number; blocked: number }[]>({
    queryKey: ["messenger-blocks"],
    queryFn: async () => {
      const res = await api.get<{ results: { id: number; blocked: number }[] } | { id: number; blocked: number }[]>("/api/messenger/blocks/")
      return Array.isArray(res.data) ? res.data : (res.data as any).results ?? []
    },
    staleTime: 30_000,
    enabled: !!currentUser,
  })
  
  const blockedEntry = React.useMemo(() => (blocks ?? []).find((b) => b.blocked === contact.id) ?? null, [blocks, contact.id])
  const isBlocked = !!blockedEntry

  const { data: conversation, isLoading: isLoadingConv } = useQuery<Conversation>({
    queryKey: conversationId ? ['conversation-by-id', conversationId] : ['conversation', contact.id],
    queryFn: async () => {
      if (conversationId) {
        const res = await api.get<Conversation>(`/api/messenger/conversations/${conversationId}/`)
        return res.data
      }
      try {
        const findRes = await api.get<Conversation>(`/api/messenger/conversations/find_by_participant/?username=${contact.username}`)
        if (findRes.status === 204 || !findRes.data) throw new Error("Not found")
        return findRes.data
      } catch {
        const createRes = await api.post<Conversation>('/api/messenger/conversations/', { target_username: contact.username })
        return createRes.data
      }
    },
    enabled: !!currentUser && (!!conversationId || !!contact.id)
  })

  const { typingUsers, handleTyping, sendTypingStatus, markRead, lastMessage } = useChat(
    conversation?.id ?? null,
    currentUser?.id ?? null,
    Math.max((conversation?.participants?.length ?? 2) - 1, 1)
  )

  const {
    data: infiniteMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['messages', conversation?.id],
    queryFn: async ({ pageParam }) => {
      if (!conversation?.id) return { results: [], next: null }
      let url = `/api/messenger/conversations/${conversation.id}/messages/`
      if (pageParam) url = `${url}?before=${encodeURIComponent(pageParam as string)}`
      const res = await api.get<{ results: Message[], next: string | null }>(url)
      return res.data
    },
    getNextPageParam: (lastPage) => lastPage.next ? lastPage.results[0]?.created_at : undefined,
    initialPageParam: null,
    enabled: !!conversation?.id,
  })

  const messages = React.useMemo(() => {
    const history = infiniteMessages?.pages?.flatMap((page) => (page as any).results || []) || []
    const seen = new Set()
    return history.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    }).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [infiniteMessages])

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, file, replyToId, clientId }: { content: string, file?: File | null, replyToId?: number | null, clientId: string }) => {
      const formData = new FormData()
      if (content) formData.append('content', content)
      if (file) formData.append('file', file)
      if (replyToId) formData.append('reply_to_id', replyToId.toString())
      formData.append('client_id', clientId)
      const res = await api.post<Message>(`/api/messenger/conversations/${conversation?.id}/send_message/`, formData)
      return res.data
    },
    onSuccess: (serverMessage, variables) => {
      setMessageInput(""); setSelectedFile(null); setReplyingTo(null)
      queryClient.setQueryData(['messages', conversation?.id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            results: p.results.map((m: any) => m.client_id === variables.clientId ? { ...serverMessage, local_status: 'sent' } : m)
          }))
        }
      })
    }
  })

  const toggleMute = async () => {
    if (!conversation) return
    const newState = !isMuted
    try {
      if (newState) {
        await api.post(`/api/messenger/conversations/${conversation.id}/mute/`)
        toast.success("Notificações silenciadas")
      } else {
        await api.post(`/api/messenger/conversations/${conversation.id}/unmute/`)
        toast.success("Notificações reativadas")
      }
      setIsMuted(newState)
      queryClient.invalidateQueries({ queryKey: ['conversation', contact.id] })
    } catch {
      toast.error("Falha ao atualizar preferências")
    }
  }

  const togglePin = async () => {
    if (!conversation) return
    const newState = !isPinned
    try {
      if (newState) {
        await api.post(`/api/messenger/conversations/${conversation.id}/pin/`)
        toast.success("Conversa fixada no topo")
      } else {
        await api.post(`/api/messenger/conversations/${conversation.id}/unpin/`)
        toast.success("Conversa desafixada")
      }
      setIsPinned(newState)
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    } catch {
      toast.error("Falha ao atualizar preferências")
    }
  }

  const deleteConversation = async () => {
    if (!conversation) return
    try {
      await api.post(`/api/messenger/conversations/${conversation.id}/delete_for_me/`)
      toast.success("Histórico removido para você")
      onBack?.()
    } catch {
      toast.error("Erro ao excluir conversa")
    }
  }

  const clearConversation = async () => {
    if (!conversation) return
    try {
      await api.post(`/api/messenger/conversations/${conversation.id}/clear_for_me/`)
      toast.success("Mensagens limpas")
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] })
    } catch {
      toast.error("Erro ao limpar mensagens")
    }
  }

  const archiveConversation = async () => {
    if (!conversation) return
    try {
      await api.post(`/api/messenger/conversations/${conversation.id}/archive_for_me/`)
      toast.success("Conversa arquivada")
      onBack?.()
    } catch {
      toast.error("Erro ao arquivar")
    }
  }

  React.useEffect(() => {
    if (conversation?.prefetched_pref?.[0]) {
      const p = conversation.prefetched_pref[0]
      setIsMuted(!!p.is_muted)
      setIsPinned(!!p.is_pinned)
    }
  }, [conversation])



  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if ((!messageInput.trim() && !selectedFile) || isBlocked) return
    const clientId = crypto.randomUUID()
    const optimisticMessage: Message = {
      id: -Date.now(),
      client_id: clientId,
      conversation: conversation!.id,
      sender: currentUser!.id,
      sender_username: currentUser!.username,
      content: messageInput || null,
      file_url: null,
      file_name: selectedFile?.name ?? null,
      file_type: selectedFile?.type ?? null,
      created_at: new Date().toISOString(),
      is_read: false,
      reactions: [],
      local_status: 'sending'
    }
    
    queryClient.setQueryData(['messages', conversation?.id], (old: any) => {
      if (!old) return { pages: [{ results: [optimisticMessage] }], pageParams: [null] }
      const newPages = [...old.pages]
      newPages[0] = { ...newPages[0], results: [...newPages[0].results, optimisticMessage] }
      return { ...old, pages: newPages }
    })

    sendMessageMutation.mutate({ content: messageInput, file: selectedFile, replyToId: replyingTo?.id, clientId })
  }

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Only scroll if user is already near the bottom (within 300px) 
    // or if it's the very first load/message
    const isNearBottom = el.parentElement!.scrollHeight - el.parentElement!.scrollTop <= el.parentElement!.clientHeight + 300
    if (isNearBottom || messages.length <= 1) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  return (
    <div className="flex flex-col h-full bg-white/2 relative">
      {/* Header Premium */}
      <div className="px-8 py-4 border-b border-white/5 bg-background/40 backdrop-blur-xl flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
           {onBack && (
             <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden h-10 w-10 rounded-xl hover:bg-white/10 transition-all">
                <ArrowLeft className="h-5 w-5" />
             </Button>
           )}
           <div className="relative">
              <Avatar className="h-12 w-12 rounded-2xl border-2 border-white/5 shadow-xl transition-transform hover:scale-105 duration-300">
                <AvatarImage src={contact.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-primary/10 text-primary font-black uppercase text-xs">{contact.username.slice(0, 2)}</AvatarFallback>
              </Avatar>
              {(onlineUsers.has(contact.id) || contact.is_online) && (
                <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-background border-2 border-background flex items-center justify-center">
                   <div className="h-full w-full rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                </div>
              )}
           </div>
           <div className="flex flex-col">
              <h3 className="font-black text-sm tracking-tight text-foreground/90 uppercase">{contact.username}</h3>
              <div className="flex items-center gap-2">
                  <span className={cn("text-[9px] font-black uppercase tracking-widest", (onlineUsers.has(contact.id) || contact.is_online) ? "text-emerald-500" : "text-muted-foreground/40")}>
                    {(onlineUsers.has(contact.id) || contact.is_online) ? "Transmissão Ativa" : "Offline"}
                  </span>
                 {typingUsers.size > 0 && (
                   <span className="text-[9px] font-black uppercase tracking-widest text-primary animate-pulse">Digitando...</span>
                 )}
              </div>
           </div>
        </div>

        <div className="flex items-center gap-2">
           <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10" onClick={() => setDetailsOpen(true)}>
              <Info className="h-5 w-5" />
           </Button>
           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10">
                    <MoreVertical className="h-5 w-5" />
                 </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl p-2 min-w-[200px]">
                 <DropdownMenuItem className="rounded-xl font-bold text-xs uppercase tracking-widest p-3 flex items-center gap-3">
                    <History className="h-4 w-4" /> Histórico de Mídia
                 </DropdownMenuItem>
                 <DropdownMenuItem className="rounded-xl font-bold text-xs uppercase tracking-widest p-3 flex items-center gap-3 text-rose-500 hover:text-rose-400">
                    <Ban className="h-4 w-4" /> Bloquear Canal
                 </DropdownMenuItem>
              </DropdownMenuContent>
           </DropdownMenu>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-hidden relative">
         <ScrollArea className="h-full px-8 py-8">
            <div className="flex flex-col gap-6">
               {hasNextPage && (
                 <Button variant="ghost" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="mx-auto h-8 rounded-full font-black uppercase tracking-widest text-[9px] border-white/5 bg-white/2 hover:bg-white/5">
                   {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <History className="h-3 w-3 mr-2" />}
                   Sincronizar Mensagens Anteriores
                 </Button>
               )}

               {messages.map((m, idx) => {
                 const isMe = m.sender === currentUser?.id
                 const showSender = !isMe && conversation?.is_group && (idx === 0 || messages[idx-1]?.sender !== m.sender)
                 
                 return (
                   <motion.div 
                     key={m.id} 
                     initial={{ opacity: 0, y: 10, scale: 0.95 }}
                     animate={{ opacity: 1, y: 0, scale: 1 }}
                     className={cn("flex flex-col max-w-[80%]", isMe ? "self-end items-end" : "self-start items-start")}
                   >
                     {showSender && <span className="text-[9px] font-black uppercase tracking-widest text-primary/60 mb-1 ml-4">{m.sender_username}</span>}
                     
                     <div className={cn(
                       "relative group p-4 text-sm font-medium shadow-2xl transition-all duration-300",
                       isMe 
                         ? "bg-primary text-primary-foreground rounded-3xl rounded-tr-sm shadow-primary/20" 
                         : "bg-white/5 backdrop-blur-md border border-white/5 text-foreground/90 rounded-3xl rounded-tl-sm"
                     )}>
                        {m.reply_to && (
                          <div className={cn("mb-3 p-3 rounded-2xl border-l-4 bg-black/10 flex flex-col gap-1", isMe ? "border-primary-foreground/30" : "border-primary/30")}>
                             <span className="text-[10px] font-black uppercase tracking-widest opacity-60">@{m.reply_to.sender_username}</span>
                             <p className="text-[11px] truncate opacity-80">{m.reply_to.content || "Arquivo"}</p>
                          </div>
                        )}
                        
                        {m.file_url && (
                          <div className="mb-2 rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                             {m.file_type?.startsWith('image/') ? (
                               <Image src={m.file_url} alt="Shared" width={400} height={400} className="w-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500" onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }} />
                             ) : (
                               <div className="p-4 flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                                     <FileIcon className="h-5 w-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                     <p className="text-xs font-bold truncate">{m.file_name}</p>
                                     <p className="text-[9px] opacity-60 uppercase font-black">{m.file_type}</p>
                                  </div>
                                  <Button variant="ghost" size="icon" asChild className="h-8 w-8 rounded-lg hover:bg-white/10">
                                     <a href={m.file_url} download><Download className="h-4 w-4" /></a>
                                  </Button>
                               </div>
                             )}
                          </div>
                        )}

                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        
                        <div className="mt-2 flex items-center justify-end gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                           <span className="text-[9px] font-black uppercase tracking-widest">{format(new Date(m.created_at), 'HH:mm')}</span>
                           {isMe && (
                             m.is_read ? <CheckCheck className="h-3 w-3 text-primary-foreground" /> : <Check className="h-3 w-3" />
                           )}
                        </div>
                        
                        <div className={cn(
                          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1",
                          isMe ? "-left-12 flex-row-reverse" : "-right-12"
                        )}>
                           <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/10" onClick={() => setReplyingTo(m)}>
                              <Reply className="h-4 w-4" />
                           </Button>
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/10">
                                    <MoreVertical className="h-4 w-4" />
                                 </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="rounded-xl border-white/10 bg-background/95 backdrop-blur-xl shadow-2xl">
                                 <DropdownMenuItem className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 p-2">
                                    <Copy className="h-3 w-3" /> Copiar Texto
                                 </DropdownMenuItem>
                                 {isMe && (
                                   <DropdownMenuItem className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 p-2 text-rose-500">
                                      <Trash2 className="h-3 w-3" /> Remover
                                   </DropdownMenuItem>
                                 )}
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </div>
                     </div>
                   </motion.div>
                 )
               })}
               <div ref={scrollRef} className="h-1" />
            </div>
         </ScrollArea>
      </div>

      {/* Input Area Premium */}
      <div className="px-8 py-6 border-t border-white/5 bg-background/40 backdrop-blur-xl relative z-10">
         {replyingTo && (
            <div className="absolute bottom-full left-8 right-8 p-4 bg-white/5 backdrop-blur-2xl border border-white/10 border-b-0 rounded-t-3xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-300">
               <div className="flex items-center gap-4 border-l-4 border-primary pl-4">
                  <div className="flex flex-col">
                     <span className="text-[10px] font-black uppercase tracking-widest text-primary">Respondendo a {replyingTo.sender_username}</span>
                     <p className="text-xs truncate max-w-md opacity-60 font-medium">{replyingTo.content || "Arquivo"}</p>
                  </div>
               </div>
               <Button variant="ghost" size="icon" onClick={() => setReplyingTo(null)} className="h-8 w-8 rounded-xl hover:bg-white/10">
                  <X className="h-4 w-4" />
               </Button>
            </div>
         )}
         
         <form onSubmit={handleSend} className="flex items-end gap-4">
            <div className="flex items-center gap-1">
               <Button type="button" variant="ghost" size="icon" className="h-12 w-12 rounded-2xl bg-white/5 hover:bg-white/10 text-muted-foreground transition-all" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-5 w-5" />
               </Button>
               <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            </div>
            
            <div className="flex-1 relative group">
               {selectedFile && (
                 <div className="absolute -top-12 left-0 p-2 bg-primary/20 backdrop-blur-xl border border-primary/20 rounded-xl flex items-center gap-3 animate-in fade-in zoom-in-95">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    <span className="text-[10px] font-bold truncate max-w-[150px]">{selectedFile.name}</span>
                    <button type="button" onClick={() => setSelectedFile(null)} className="text-rose-500 hover:scale-110 transition-transform"><X className="h-3 w-3" /></button>
                 </div>
               )}
               <Input
                 placeholder="Digite sua mensagem aqui..."
                 value={messageInput}
                 onChange={(e) => { setMessageInput(e.target.value); handleTyping() }}
                 className="h-12 px-6 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 focus:ring-primary/20 transition-all font-medium shadow-inner pr-12"
               />
               <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg hover:bg-white/10 text-muted-foreground">
                  <SmilePlus className="h-5 w-5" />
               </Button>
            </div>
            
            <Button type="submit" disabled={(!messageInput.trim() && !selectedFile) || sendMessageMutation.isPending || isBlocked} className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-xl shadow-primary/30 shrink-0 transition-all active:scale-95">
               {sendMessageMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
         </form>
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
         <SheetContent className="sm:max-w-[480px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-l-[3rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="h-48 bg-gradient-to-br from-primary/20 to-blue-600/20 relative">
               <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px]" />
               <Button variant="ghost" size="icon" className="absolute top-6 left-6 h-10 w-10 rounded-xl bg-black/20 backdrop-blur-xl text-white hover:bg-black/40" onClick={() => setDetailsOpen(false)}>
                  <X className="h-5 w-5" />
               </Button>
            </div>
            <div className="px-10 -mt-16 flex flex-col items-center gap-4 relative z-10">
               <Avatar className="h-32 w-32 rounded-[2.5rem] border-4 border-background shadow-2xl">
                  <AvatarImage src={contact.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback className="text-4xl font-black">{contact.username.slice(0, 2).toUpperCase()}</AvatarFallback>
               </Avatar>
               <div className="text-center space-y-1">
                  <h2 className="text-3xl font-black tracking-tighter uppercase">{contact.username}</h2>
                  <p className="text-xs font-black uppercase tracking-widest text-primary opacity-60">Status de Rede: Operacional</p>
               </div>
            </div>
            <div className="px-10 py-10 space-y-8 flex-1 overflow-y-auto">
               <section className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Configurações do Canal</h4>
                  <div className="grid gap-2">
                     <Button variant="outline" className="h-12 w-full rounded-2xl border-white/10 bg-white/5 justify-between px-6 font-bold text-sm" onClick={toggleMute}>
                        <div className="flex items-center gap-3">
                           {isMuted ? <BellOff className="h-4 w-4 text-rose-500" /> : <Bell className="h-4 w-4 text-emerald-500" />}
                           Silenciar Notificações
                        </div>
                        <div className={cn("h-1.5 w-1.5 rounded-full", isMuted ? "bg-rose-500" : "bg-emerald-500")} />
                     </Button>
                     <Button variant="outline" className="h-12 w-full rounded-2xl border-white/10 bg-white/5 justify-between px-6 font-bold text-sm" onClick={togglePin}>
                        <div className="flex items-center gap-3">
                           <Pin className="h-4 w-4 text-primary" /> Fixar Conversa
                        </div>
                        <div className={cn("h-1.5 w-1.5 rounded-full", isPinned ? "bg-primary" : "bg-muted-foreground/20")} />
                     </Button>
                  </div>
               </section>
               <section className="space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-1">Ações Críticas</h4>
                  <div className="grid gap-2">
                      <Button variant="ghost" className="h-12 w-full rounded-2xl hover:bg-rose-500/10 text-rose-500 justify-start px-6 font-bold text-sm gap-3" onClick={archiveConversation}>
                        <Archive className="h-4 w-4" /> Arquivar Conversa
                     </Button>
                     <Button variant="ghost" className="h-12 w-full rounded-2xl hover:bg-rose-500/10 text-rose-500 justify-start px-6 font-bold text-sm gap-3" onClick={clearConversation}>
                        <X className="h-4 w-4" /> Limpar Mensagens
                     </Button>
                     <Button variant="ghost" className="h-12 w-full rounded-2xl hover:bg-rose-500/10 text-rose-500 justify-start px-6 font-bold text-sm gap-3" onClick={deleteConversation}>
                        <Trash2 className="h-4 w-4" /> Excluir Histórico de Transmissão
                     </Button>
                  </div>
               </section>
            </div>
         </SheetContent>
      </Sheet>

      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        index={lightboxIndex}
        slides={messages.filter(m => m.file_type?.startsWith('image/')).map(m => ({ src: m.file_url! }))}
      />
    </div>
  )
}
