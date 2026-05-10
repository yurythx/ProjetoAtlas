"use client"

import { useState, useMemo } from "react"
import { Contact, User } from "@/types"
import { Conversation } from "@/types/messenger"
import { Search, Plus, Loader2, Pin, Users, Trash2, Archive, MessageCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { usePresence } from "@/hooks/use-presence"
import { cn } from "@/lib/utils"
import {
  fetchAndUpsertConversation,
  removeConversation,
  updateArchivedCache,
  updateConversation,
  updateConversationsCache,
  updateDeletedCache,
  upsertConversation,
} from "./cache/conversations"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface ContactListProps {
  onSelectContact: (contact: Contact, conversationId: number) => void
  selectedContactId?: number
  currentUser: User | null
}

interface DisplayItem {
  convId: number
  title: string
  isGroup: boolean
  unreadCount: number
  isPinned: boolean
  isMuted: boolean
  lastMessage: Conversation["last_message"] | null
  contact: Contact
  avatarUrl?: string | null
  status: 'online' | 'busy' | 'offline'
  isOnline: boolean
  updatedAt: string
}

export function ContactList({ onSelectContact, selectedContactId, currentUser }: ContactListProps) {
  const [search, setSearch] = useState("")
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false)
  const [isDeletedDialogOpen, setIsDeletedDialogOpen] = useState(false)
  const [isArchivedDialogOpen, setIsArchivedDialogOpen] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [selectedContactsForGroup, setSelectedContactsForGroup] = useState<number[]>([])

  const { onlineUsers, userStatuses } = usePresence()
  const queryClient = useQueryClient()

  // ── Mutations ─────────────────────────────────────────────────────────────
  const pinMutation = useMutation({
    mutationFn: async ({ convId, action }: { convId: number, action: 'pin' | 'unpin' }) => {
      await api.post(`/api/messenger/conversations/${convId}/${action}/`)
    },
    onSuccess: (_data, variables) => {
      updateConversationsCache(queryClient, (list) =>
        updateConversation(list, variables.convId, (c) => ({
          ...c,
          preference: { ...(c.preference ?? { is_muted: false, is_pinned: false }), is_pinned: variables.action === 'pin' },
        })),
      )
    },
    onError: () => {
      toast.error("Erro ao atualizar preferência de fixação")
    }
  })

  const muteMutation = useMutation({
    mutationFn: async ({ convId, action }: { convId: number, action: 'mute' | 'unmute' }) => {
      await api.post(`/api/messenger/conversations/${convId}/${action}/`)
    },
    onSuccess: (_data, variables) => {
      updateConversationsCache(queryClient, (list) =>
        updateConversation(list, variables.convId, (c) => ({
          ...c,
          preference: { ...(c.preference ?? { is_muted: false, is_pinned: false }), is_muted: variables.action === 'mute' },
        })),
      )
    },
    onError: () => {
      toast.error("Erro ao atualizar preferência de silenciamento")
    }
  })

  // ── Conversations ──────────────────────────────────────────────────────────
  const { data: conversationsRaw, isLoading: convLoading } = useQuery<Conversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await api.get<{ results: Conversation[] } | Conversation[]>("/api/messenger/conversations/")
      return Array.isArray(res.data) ? res.data : (res.data as { results: Conversation[] }).results ?? []
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!currentUser,
  })

  const { data: deletedConversationsRaw, isLoading: deletedLoading } = useQuery<Conversation[]>({
    queryKey: ["conversations-deleted"],
    queryFn: async () => {
      const res = await api.get<{ results: Conversation[] } | Conversation[]>("/api/messenger/conversations/deleted/")
      return Array.isArray(res.data) ? res.data : (res.data as { results: Conversation[] }).results ?? []
    },
    enabled: !!currentUser && isDeletedDialogOpen,
  })

  const { data: archivedConversationsRaw, isLoading: archivedLoading } = useQuery<Conversation[]>({
    queryKey: ["conversations-archived"],
    queryFn: async () => {
      const res = await api.get<{ results: Conversation[] } | Conversation[]>("/api/messenger/conversations/archived/")
      return Array.isArray(res.data) ? res.data : (res.data as { results: Conversation[] }).results ?? []
    },
    enabled: !!currentUser && isArchivedDialogOpen,
  })

  // ── Contacts (for group dialog + participant lookup) ────────────────────────
  const { data: contactsRaw, isLoading: contactsLoading } = useQuery<Contact[] | { results: Contact[] }>({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await api.get<Contact[] | { results: Contact[] }>("/api/messenger/contacts/")
      return res.data
    },
    staleTime: 60_000,
    enabled: !!currentUser,
  })

  const isLoading = convLoading || contactsLoading

  const contactList = useMemo(
    () => (Array.isArray(contactsRaw) ? contactsRaw : (contactsRaw as { results: Contact[] })?.results ?? []),
    [contactsRaw],
  )

  const contactByUsername = useMemo(() => {
    const map = new Map<string, Contact>()
    for (const c of contactList) map.set(c.username, c)
    return map
  }, [contactList])

  // ── Build display list ─────────────────────────────────────────────────────
  const displayList = useMemo<DisplayItem[]>(() => {
    const conversations = Array.isArray(conversationsRaw) ? conversationsRaw : []
    return conversations
      .map((conv) => {
        const isPinned = !!conv.preference?.is_pinned
        const isMuted = !!conv.preference?.is_muted
        const unreadCount = conv.unread_count ?? 0

        if (conv.is_group) {
          const fakeContact: Contact = {
            id: -(conv.id),
            username: conv.title || "Grupo",
            email: "",
            avatar_url: null,
            is_online: false,
            group_names: [],
            is_staff: false,
            status: "offline",
          }
          return {
            convId: conv.id,
            title: conv.title || "Grupo sem nome",
            isGroup: true,
            unreadCount,
            isPinned,
            isMuted,
            lastMessage: conv.last_message ?? null,
            contact: fakeContact,
            avatarUrl: null,
            status: "offline" as const,
            isOnline: false,
            updatedAt: conv.updated_at,
          } as DisplayItem
        }

        const participantUsernames = conv.participants_list ?? []
        const otherUsername = participantUsernames.find((u) => u !== currentUser?.username)

        if (!otherUsername) return null

        const otherContact = contactByUsername.get(otherUsername)
        const contactForClick: Contact = otherContact ?? {
          id: 0,
          username: otherUsername,
          email: "",
          avatar_url: null,
          is_online: false,
          group_names: [],
          is_staff: false,
          status: "offline",
        }

        const effectiveStatus: 'online' | 'busy' | 'offline' = (() => {
          if (otherContact?.id && userStatuses.has(otherContact.id)) {
            return userStatuses.get(otherContact.id) ?? 'offline'
          }
          const s = otherContact?.status
          if (s === 'online' || s === 'busy' || s === 'offline') return s
          return 'offline'
        })()

        return {
          convId: conv.id,
          title: otherUsername,
          isGroup: false,
          unreadCount,
          isPinned,
          isMuted,
          lastMessage: conv.last_message ?? null,
          contact: contactForClick,
          avatarUrl: otherContact?.avatar_url,
          status: effectiveStatus,
          isOnline: otherContact?.id ? effectiveStatus !== 'offline' : false,
          updatedAt: conv.updated_at,
        } as DisplayItem
      })
      .filter((item): item is DisplayItem => item !== null)
  }, [conversationsRaw, contactByUsername, currentUser?.username, userStatuses])

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return displayList.filter((c) => c.title.toLowerCase().includes(q))
  }, [displayList, search])

  const sorted = useMemo<DisplayItem[]>(() => {
    return [...filtered].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [filtered])

  const createGroupMutation = useMutation({
    mutationFn: async () => {
      if (!groupName.trim()) throw new Error("Nome do grupo é obrigatório")
      if (selectedContactsForGroup.length === 0) throw new Error("Selecione pelo menos um participante")
      const selectedUsernames = contactList
        .filter((c) => selectedContactsForGroup.includes(c.id))
        .map((c) => c.username)
      await api.post("/api/messenger/conversations/", {
        title: groupName,
        participant_usernames: selectedUsernames,
        is_group: true,
      })
    },
    onSuccess: () => {
      toast.success("Grupo criado com sucesso!")
      setIsGroupDialogOpen(false)
      setGroupName("")
      setSelectedContactsForGroup([])
      queryClient.invalidateQueries({ queryKey: ["conversations"] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erro ao criar grupo. Tente novamente."
      toast.error(msg)
    },
  })

  const togglePin = (convId: number, isPinned: boolean) => {
    pinMutation.mutate({ convId, action: isPinned ? 'unpin' : 'pin' })
  }

  const toggleMute = (convId: number, isMuted: boolean) => {
    muteMutation.mutate({ convId, action: isMuted ? 'unmute' : 'mute' })
  }

  const toggleContactSelection = (id: number) => {
    setSelectedContactsForGroup((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const getContactForConversation = (conv: Conversation): Contact => {
    if (conv.is_group) {
      return {
        id: -(conv.id),
        username: conv.title || "Grupo",
        email: "",
        avatar_url: null,
        is_online: false,
        group_names: [],
        is_staff: false,
        status: "offline",
      }
    }

    const participantUsernames = conv.participants_list ?? []
    const otherUsername = participantUsernames.find((u) => u !== currentUser?.username)
    if (!otherUsername) {
      return {
        id: 0,
        username: "Conversa",
        email: "",
        avatar_url: null,
        is_online: false,
        group_names: [],
        is_staff: false,
        status: "offline",
      }
    }

    const otherContact = contactByUsername.get(otherUsername)
    return (
      otherContact ?? {
        id: 0,
        username: otherUsername,
        email: "",
        avatar_url: null,
        is_online: false,
        group_names: [],
        is_staff: false,
        status: "offline",
      }
    )
  }

  const openConversation = (conv: Conversation) => {
    const contact = getContactForConversation(conv)
    onSelectContact(contact, conv.id)
  }

  const restoreConversation = async (convId: number) => {
    await api.post(`/api/messenger/conversations/${convId}/restore_for_me/`)
    updateDeletedCache(queryClient, (list) => removeConversation(list, convId))
    try {
      await fetchAndUpsertConversation(queryClient, convId)
    } catch { }
    toast.success("Conversa restaurada")
  }

  const archiveConversationFromDeleted = async (conv: Conversation) => {
    const convId = conv.id
    await api.post(`/api/messenger/conversations/${convId}/restore_for_me/`)
    await api.post(`/api/messenger/conversations/${convId}/archive_for_me/`)

    updateDeletedCache(queryClient, (list) => removeConversation(list, convId))
    updateConversationsCache(queryClient, (list) => removeConversation(list, convId))
    updateArchivedCache(queryClient, (list) =>
      upsertConversation(list, {
        ...conv,
        preference: {
          ...(conv.preference ?? { is_muted: false, is_pinned: false }),
          is_deleted: false,
          deleted_at: null,
          is_archived: true,
          archived_at: new Date().toISOString(),
        },
      }),
    )

    toast.success("Conversa arquivada")
  }

  const unarchiveConversation = async (convId: number) => {
    await api.post(`/api/messenger/conversations/${convId}/unarchive_for_me/`)
    updateArchivedCache(queryClient, (list) => removeConversation(list, convId))
    try {
      await fetchAndUpsertConversation(queryClient, convId)
    } catch { }
    toast.success("Conversa desarquivada")
  }

  const deleteConversationForMeFromArchived = async (conv: Conversation) => {
    const convId = conv.id
    await api.post(`/api/messenger/conversations/${convId}/delete_for_me/`)

    updateArchivedCache(queryClient, (list) => removeConversation(list, convId))
    updateConversationsCache(queryClient, (list) => removeConversation(list, convId))
    updateDeletedCache(queryClient, (list) =>
      upsertConversation(list, {
        ...conv,
        preference: {
          ...(conv.preference ?? { is_muted: false, is_pinned: false }),
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        },
      }),
    )

    toast.success("Conversa removida", {
      action: {
        label: "Desfazer",
        onClick: async () => {
          try {
            await api.post(`/api/messenger/conversations/${convId}/restore_for_me/`)
            await api.post(`/api/messenger/conversations/${convId}/archive_for_me/`)
            updateDeletedCache(queryClient, (list) => removeConversation(list, convId))
            updateConversationsCache(queryClient, (list) => removeConversation(list, convId))
            updateArchivedCache(queryClient, (list) =>
              upsertConversation(list, {
                ...conv,
                preference: {
                  ...(conv.preference ?? { is_muted: false, is_pinned: false }),
                  is_deleted: false,
                  deleted_at: null,
                  is_archived: true,
                  archived_at: new Date().toISOString(),
                },
              }),
            )
            toast.success("Conversa restaurada para arquivadas")
          } catch {
            toast.error("Erro ao desfazer remoção")
          }
        },
      },
      duration: 6000,
    })
  }

  if (isLoading) {
    return (
      <div className="w-full h-full border-r border-white/5 bg-white/5 flex flex-col p-6 space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4 p-2">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32 rounded-lg" />
                <Skeleton className="h-3 w-48 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-white/2">
      {/* Header with Search & Actions */}
      <div className="p-6 border-b border-white/5 space-y-6 bg-background/20 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
             <h2 className="font-black text-xl tracking-tighter uppercase text-primary">Transmissões</h2>
             <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Canais Ativos Atlas</p>
          </div>
          <div className="flex items-center gap-2">
             {/* New Group Dialog */}
             <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
               <DialogTrigger asChild>
                 <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-white/10 bg-white/5 hover:bg-white/10 shadow-lg">
                   <Plus className="h-5 w-5 text-primary" />
                 </Button>
               </DialogTrigger>
               <DialogContent className="sm:max-w-[480px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-[2.5rem] overflow-hidden shadow-2xl">
                 <DialogHeader className="px-8 pt-8 pb-6 bg-white/5 border-b border-white/10">
                   <DialogTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
                      <Users className="h-6 w-6 text-primary" /> Criar Novo Grupo
                   </DialogTitle>
                 </DialogHeader>
                 <div className="px-8 py-8 space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Identificação da Sala</label>
                       <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ex: War Room - Projeto X" className="h-12 rounded-xl border-white/10 bg-white/5 font-bold" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Selecionar Membros</label>
                       <div className="border border-white/10 bg-white/5 rounded-2xl overflow-hidden">
                          <ScrollArea className="h-64 p-4">
                             <div className="grid gap-2">
                                {contactList.map((contact) => (
                                  <div key={contact.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer" onClick={() => toggleContactSelection(contact.id)}>
                                     <Checkbox checked={selectedContactsForGroup.includes(contact.id)} onCheckedChange={() => toggleContactSelection(contact.id)} className="data-[state=checked]:bg-primary" />
                                     <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={contact.avatar_url || undefined} />
                                        <AvatarFallback className="bg-primary/10 text-primary font-black">{contact.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                                     </Avatar>
                                     <span className="text-sm font-bold">{contact.username}</span>
                                  </div>
                                ))}
                             </div>
                          </ScrollArea>
                       </div>
                    </div>
                 </div>
                 <div className="px-8 py-6 bg-white/5 border-t border-white/10 flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setIsGroupDialogOpen(false)} className="h-10 rounded-xl font-black uppercase tracking-widest text-[10px]">Cancelar</Button>
                    <Button onClick={() => createGroupMutation.mutate()} disabled={createGroupMutation.isPending} className="h-10 px-8 rounded-xl font-black uppercase tracking-widest text-[10px] bg-primary shadow-lg shadow-primary/20">
                       {createGroupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar Grupo"}
                    </Button>
                 </div>
               </DialogContent>
             </Dialog>

             {/* More Actions Menu (Archived/Deleted) */}
             <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setIsArchivedDialogOpen(true)} className="h-9 w-9 rounded-xl hover:bg-white/5 text-muted-foreground">
                   <Archive className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setIsDeletedDialogOpen(true)} className="h-9 w-9 rounded-xl hover:bg-white/5 text-muted-foreground">
                   <Trash2 className="h-4 w-4" />
                </Button>
             </div>
          </div>
        </div>
        
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Localizar transmissão..."
            className="pl-11 h-11 bg-white/5 border-white/10 rounded-2xl focus:bg-white/10 transition-all font-medium shadow-inner"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation List Section */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col p-4 gap-2">
          {sorted.length === 0 ? (
            <div className="py-20 text-center space-y-4 opacity-30">
               <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground" />
               <p className="text-[10px] font-black uppercase tracking-[0.2em]">Nenhum canal ativo</p>
            </div>
          ) : (
            sorted.map((item) => {
              const contact = item.contact
              const onlineStatus = item.isGroup
                ? "offline"
                : (userStatuses.get(contact.id) || item.status)
              const isOnline = item.isGroup ? false : (item.isOnline || onlineUsers.has(contact.id))
              const isSelected = selectedContactId === contact.id

              return (
                <div
                  key={item.convId}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-3xl transition-all relative overflow-hidden group cursor-pointer",
                    isSelected 
                      ? "bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5" 
                      : "hover:bg-white/5 border border-transparent hover:border-white/10"
                  )}
                  onClick={() => onSelectContact(contact, item.convId)}
                >
                  {isSelected && (
                     <div className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-r-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                  )}

                  {/* Avatar Section */}
                  <div className="relative shrink-0">
                    <Avatar className={cn(
                      "h-12 w-12 rounded-2xl border-2 transition-all duration-500",
                      isSelected ? "border-primary shadow-lg shadow-primary/20" : "border-white/5 group-hover:border-white/20"
                    )}>
                      {item.isGroup ? (
                        <AvatarFallback className="bg-primary/5 text-primary">
                          <Users className="h-6 w-6" />
                        </AvatarFallback>
                      ) : (
                        <>
                          <AvatarImage src={item.avatarUrl || undefined} className="object-cover" />
                          <AvatarFallback className="font-black text-xs bg-primary/10 text-primary">
                            {item.title.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </>
                      )}
                    </Avatar>
                    
                    {isOnline && (
                      <div className="absolute -bottom-1 -right-1 flex items-center justify-center">
                         <div className="h-4 w-4 rounded-full bg-background border-2 border-background">
                            <div className={cn(
                              "h-full w-full rounded-full shadow-[0_0_10px_currentColor]",
                              onlineStatus === "online" ? "bg-emerald-500 text-emerald-500 animate-pulse" :
                              onlineStatus === "busy" ? "bg-orange-500 text-orange-500" : "bg-slate-500 text-slate-500"
                            )} />
                         </div>
                      </div>
                    )}
                  </div>

                  {/* Info Section */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2 truncate">
                        <span className={cn("text-sm font-black tracking-tight truncate", isSelected ? "text-primary" : "text-foreground/90")}>
                           {item.title}
                        </span>
                        {item.isPinned && <Pin className="h-3 w-3 text-primary shrink-0 opacity-60" />}
                      </div>
                      <span className="text-[9px] font-black text-muted-foreground/40 shrink-0">
                        {item.updatedAt ? format(new Date(item.updatedAt), 'HH:mm') : ''}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-end">
                       <span className="text-xs text-muted-foreground font-bold truncate opacity-60 group-hover:opacity-100 transition-opacity">
                         {item.lastMessage ? (
                           <>
                             {item.isGroup && <span className="text-primary/70">{item.lastMessage.sender_username}: </span>}
                             {item.lastMessage.content || (item.lastMessage.file_name ? "📎 Arquivo" : "Mensagem")}
                           </>
                         ) : (
                           isOnline ? (onlineStatus === 'online' ? 'Canal Disponível' : 'Ocupado') : 'Offline'
                         )}
                       </span>
                       
                       {item.unreadCount > 0 && (
                         <div className="h-5 min-w-[20px] px-1.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center shadow-lg shadow-primary/30">
                           {item.unreadCount > 99 ? "99+" : item.unreadCount}
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/5 bg-white/2 flex items-center justify-center gap-3">
         <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-lg shadow-primary/40 animate-pulse" />
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-50">Transmissão Segura Atlas P2P</span>
         </div>
      </div>

      {/* Dialogs for Archive/Trash - Simplified for consistency */}
      <Dialog open={isArchivedDialogOpen} onOpenChange={setIsArchivedDialogOpen}>
        <DialogContent className="sm:max-w-[560px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl">
          <DialogHeader className="px-8 pt-8 pb-6 bg-white/5 border-b border-white/10">
            <DialogTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
               <Archive className="h-6 w-6 text-primary" /> Arquivo de Conversas
            </DialogTitle>
          </DialogHeader>
          <div className="px-8 py-8 h-[400px]">
            <ScrollArea className="h-full">
              {archivedLoading ? (
                 <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" /></div>
              ) : archivedConversationsRaw?.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-20"><Archive className="h-12 w-12 mb-2" /><span className="text-[10px] font-black uppercase tracking-widest">Nada arquivado</span></div>
              ) : (
                <div className="grid gap-4">
                   {archivedConversationsRaw?.map(conv => (
                     <div key={conv.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 group">
                        <div className="min-w-0">
                           <div className="font-bold text-sm">{conv.is_group ? conv.title : conv.participants_list?.find(u => u !== currentUser?.username)}</div>
                           <div className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tight">{conv.last_message?.content || 'Arquivo'}</div>
                        </div>
                        <div className="flex gap-2">
                           <Button size="sm" variant="ghost" className="h-8 rounded-lg font-black uppercase tracking-widest text-[9px]" onClick={() => { setIsArchivedDialogOpen(false); openConversation(conv); }}>Abrir</Button>
                           <Button size="sm" variant="outline" className="h-8 rounded-lg font-black uppercase tracking-widest text-[9px] border-white/10" onClick={() => unarchiveConversation(conv.id)}>Restaurar</Button>
                        </div>
                     </div>
                   ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeletedDialogOpen} onOpenChange={setIsDeletedDialogOpen}>
        <DialogContent className="sm:max-w-[560px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl">
          <DialogHeader className="px-8 pt-8 pb-6 bg-white/5 border-b border-white/10 text-rose-500">
            <DialogTitle className="text-2xl font-black tracking-tighter flex items-center gap-3">
               <Trash2 className="h-6 w-6" /> Lixeira de Transmissões
            </DialogTitle>
          </DialogHeader>
          <div className="px-8 py-8 h-[400px]">
            <ScrollArea className="h-full">
              {deletedLoading ? (
                 <div className="h-full flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" /></div>
              ) : deletedConversationsRaw?.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center opacity-20"><Trash2 className="h-12 w-12 mb-2" /><span className="text-[10px] font-black uppercase tracking-widest">Lixeira vazia</span></div>
              ) : (
                <div className="grid gap-4">
                   {deletedConversationsRaw?.map(conv => (
                     <div key={conv.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 group">
                        <div className="min-w-0">
                           <div className="font-bold text-sm">{conv.is_group ? conv.title : conv.participants_list?.find(u => u !== currentUser?.username)}</div>
                           <div className="text-[10px] text-muted-foreground truncate font-bold uppercase tracking-tight">{conv.last_message?.content || 'Arquivo'}</div>
                        </div>
                        <div className="flex gap-2">
                           <Button size="sm" variant="outline" className="h-8 rounded-lg font-black uppercase tracking-widest text-[9px] border-white/10" onClick={() => restoreConversation(conv.id)}>Restaurar</Button>
                        </div>
                     </div>
                   ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
