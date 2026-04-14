import { useState, useMemo } from "react"
import { Contact, User } from "@/types"
import { Conversation } from "@/types/messenger"
import { Search, Plus, Loader2, Pin, BellOff, Users, Trash2, RotateCcw, Archive } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Button, buttonVariants } from "@/components/ui/button"
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

  // Build a lookup map: username -> Contact, for O(1) resolution
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
      // Sort by most recent message
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [filtered])

  // ── Mutations ─────────────────────────────────────────────────────────────
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

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full h-full border-r border-border/50 bg-muted/10 flex flex-col" role="status">
        <div className="p-4 border-b border-border/50 space-y-4">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full border-r border-border/50 bg-muted/10 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border/50 space-y-4 bg-background/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg tracking-tight">Mensagens</h2>
          <div className="flex items-center gap-1">
            <Dialog open={isArchivedDialogOpen} onOpenChange={setIsArchivedDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Conversas arquivadas">
                  <Archive className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[520px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                  <DialogTitle>Conversas arquivadas</DialogTitle>
                  <DialogDescription>Restaure conversas arquivadas para a lista principal.</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 p-4 sm:p-6">
                  <ScrollArea className="h-full border rounded-md p-2">
                    {archivedLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : (archivedConversationsRaw?.length ? (
                      <div className="grid gap-1">
                        {archivedConversationsRaw.map((conv) => {
                          const title = conv.is_group
                            ? (conv.title || "Grupo sem nome")
                            : (conv.participants_list?.find((u) => u !== currentUser?.username) || "Conversa")
                          return (
                            <div key={conv.id} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-muted/50">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{title}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {conv.last_message?.content || (conv.last_message?.file_name ? "📎 Arquivo" : "")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setIsArchivedDialogOpen(false)
                                    openConversation(conv)
                                  }}
                                >
                                  Abrir
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive"
                                  onClick={async () => {
                                    try {
                                      await deleteConversationForMeFromArchived(conv)
                                    } catch {
                                      toast.error("Erro ao remover conversa")
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remover
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await unarchiveConversation(conv.id)
                                      setIsArchivedDialogOpen(false)
                                      openConversation(conv)
                                    } catch {
                                      toast.error("Erro ao desarquivar conversa")
                                    }
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Desarquivar
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        Nenhuma conversa arquivada.
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isDeletedDialogOpen} onOpenChange={setIsDeletedDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Conversas removidas">
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[520px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                  <DialogTitle>Conversas removidas</DialogTitle>
                  <DialogDescription>Restaure conversas removidas da sua lista.</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 p-4 sm:p-6">
                  <ScrollArea className="h-full border rounded-md p-2">
                    {deletedLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : (deletedConversationsRaw?.length ? (
                      <div className="grid gap-1">
                        {deletedConversationsRaw.map((conv) => {
                          const title = conv.is_group
                            ? (conv.title || "Grupo sem nome")
                            : (conv.participants_list?.find((u) => u !== currentUser?.username) || "Conversa")
                          return (
                            <div key={conv.id} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-muted/50">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">{title}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {conv.last_message?.content || (conv.last_message?.file_name ? "📎 Arquivo" : "")}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setIsDeletedDialogOpen(false)
                                    openConversation(conv)
                                  }}
                                >
                                  Abrir
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await archiveConversationFromDeleted(conv)
                                    } catch {
                                      toast.error("Erro ao arquivar conversa")
                                    }
                                  }}
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Arquivar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      await restoreConversation(conv.id)
                                      setIsDeletedDialogOpen(false)
                                      openConversation(conv)
                                    } catch {
                                      toast.error("Erro ao restaurar conversa")
                                    }
                                  }}
                                >
                                  <RotateCcw className="mr-2 h-4 w-4" />
                                  Restaurar
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                        Nenhuma conversa removida.
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Criar novo grupo">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-[460px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0 grid grid-rows-[auto_1fr_auto]">
                <DialogHeader className="border-b bg-muted/30 px-4 py-4 text-left sm:px-6 sm:py-5">
                  <DialogTitle>Criar Novo Grupo</DialogTitle>
                  <DialogDescription>Dê um nome ao grupo e selecione os participantes.</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <label htmlFor="group-name" className="text-sm font-medium">Nome do Grupo</label>
                      <Input
                        id="group-name"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Ex: Projeto Atlas"
                      />
                    </div>
                    <div className="grid gap-2 min-h-0">
                      <label className="text-sm font-medium">Participantes</label>
                      <div className="min-h-0 border rounded-md">
                        <ScrollArea className="h-[200px] p-2">
                          {contactList.map((contact) => (
                            <div key={contact.id} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded-md">
                              <Checkbox
                                id={`g-contact-${contact.id}`}
                                checked={selectedContactsForGroup.includes(contact.id)}
                                onCheckedChange={() => toggleContactSelection(contact.id)}
                              />
                              <label
                                htmlFor={`g-contact-${contact.id}`}
                                className="text-sm font-medium flex items-center gap-2 cursor-pointer w-full"
                              >
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={contact.avatar_url || undefined} alt={contact.username} />
                                  <AvatarFallback>{contact.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                {contact.username}
                              </label>
                            </div>
                          ))}
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter className="border-t bg-background/60 px-4 py-4 sm:px-6">
                  <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={() => createGroupMutation.mutate()} disabled={createGroupMutation.isPending}>
                    {createGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar Grupo
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversas..."
            className="pl-9 h-10 bg-background/50 border-border/50 focus:bg-background transition-colors"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col p-2 gap-1">
          {sorted.map((item) => {
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
                  buttonVariants({ variant: isSelected ? "secondary" : "ghost", size: "default" }),
                  "justify-start h-auto py-3 px-3 relative group transition-all text-left cursor-pointer",
                )}
                onClick={() => onSelectContact(contact, item.convId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onSelectContact(contact, item.convId)
                  }
                }}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                    {item.isGroup ? (
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Users className="h-5 w-5" />
                      </AvatarFallback>
                    ) : (
                      <>
                        <AvatarImage src={item.avatarUrl || undefined} alt={item.title} />
                        <AvatarFallback className="font-bold text-xs bg-primary/10 text-primary">
                          {item.title.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  {isOnline && (
                    <span
                      className={cn(
                        "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background shadow-sm",
                        onlineStatus === "online" ? "bg-green-500 animate-pulse" :
                          onlineStatus === "busy" ? "bg-amber-500" : "bg-slate-400",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col items-start ml-3 flex-1 min-w-0 overflow-hidden">
                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-sm truncate max-w-[140px]">{item.title}</span>
                      {item.isPinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {item.isMuted && <BellOff className="h-3 w-3 text-muted-foreground" />}
                      {item.unreadCount > 0 && (
                        <Badge className="h-5 min-w-[20px] px-1.5 rounded-full bg-green-500 text-white border-0 text-[10px] font-bold">
                          {item.unreadCount > 99 ? "99+" : item.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground truncate w-full text-left">
                    {item.lastMessage ? (
                      <>
                        {item.isGroup && (
                          <span className="font-medium">{item.lastMessage.sender_username}: </span>
                        )}
                        {item.lastMessage.content ||
                          (item.lastMessage.file_name ? "📎 Arquivo" : "Mensagem")}
                      </>
                    ) : isOnline ? (
                      <span
                        className={cn(
                          "font-medium",
                          onlineStatus === "online" ? "text-green-600" :
                            onlineStatus === "busy" ? "text-amber-600" : "text-muted-foreground",
                        )}
                      >
                        {onlineStatus === "online" ? "Online" :
                          onlineStatus === "busy" ? "Ocupado" : "Offline"}
                      </span>
                    ) : (
                      "Nenhuma mensagem ainda"
                    )}
                  </span>
                </div>

                {/* Action Buttons (hover/active) */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-1 group-hover:opacity-100 opacity-0 focus-within:opacity-100 transition-opacity">
                  {/* Mute toggle */}
                  <Button
                    type="button"
                    variant={item.isMuted ? "secondary" : "ghost"}
                    size="icon"
                    className={cn("h-7 w-7 rounded-full text-muted-foreground", item.isMuted && "text-primary")}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMute(item.convId, item.isMuted)
                    }}
                    aria-label={item.isMuted ? "Ativar som" : "Silenciar"}
                    title={item.isMuted ? "Ativar som" : "Silenciar"}
                  >
                    {muteMutation.isPending && muteMutation.variables?.convId === item.convId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BellOff className={cn("h-3.5 w-3.5", !item.isMuted && "opacity-40")} />
                    )}
                  </Button>

                  {/* Pin toggle */}
                  <Button
                    type="button"
                    variant={item.isPinned ? "secondary" : "ghost"}
                    size="icon"
                    className={cn("h-7 w-7 rounded-full text-muted-foreground", item.isPinned && "text-primary")}
                    onClick={(e) => {
                      e.stopPropagation()
                      togglePin(item.convId, item.isPinned)
                    }}
                    aria-label={item.isPinned ? "Desafixar" : "Fixar"}
                    title={item.isPinned ? "Desafixar" : "Fixar"}
                  >
                    {pinMutation.isPending && pinMutation.variables?.convId === item.convId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Pin className={cn("h-3.5 w-3.5", item.isPinned && "rotate-45")} />
                    )}
                  </Button>
                </div>
              </div>
            )
          })}

          {sorted.length === 0 && !isLoading && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {search ? "Nenhuma conversa encontrada" : "Sem conversas ainda"}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
