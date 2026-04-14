"use client"

import { useState, useEffect, useMemo } from "react"
import { ContactList } from "./contact-list"
import { ChatWindow } from "./chat-window"
import { Contact } from "@/types"
import { Message } from "@/types/messenger"
import type { Conversation } from "@/types/messenger"
import { MessageSquareDashed, Loader2, SlidersHorizontal } from "lucide-react"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { useSearchParams, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/hooks/use-auth"

export function MessengerView() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filter, setFilter] = useState<"all" | "media" | "files">("all")
  const [userFilter, setUserFilter] = useState("")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [hasAttachments, setHasAttachments] = useState(false)
  const [fileKind, setFileKind] = useState<"any" | "image" | "video" | "audio" | "pdf" | "doc" | "xls" | "ppt" | "zip">("any")
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [onlyWithReactions, setOnlyWithReactions] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const conversationId = searchParams.get("conversation")
  const messageIdParam = searchParams.get("message_id") || searchParams.get("message") || searchParams.get("mid")
  const createdAtParam = searchParams.get("created_at") || searchParams.get("ts")

  const { user: currentUser, isLoading } = useAuth()

  const resolvePresenceStatus = (value: unknown, isOnlineFallback?: boolean): Contact["status"] => {
    if (value === "online" || value === "busy" || value === "offline") return value
    return isOnlineFallback ? "online" : "offline"
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => {
    try {
      if (messageIdParam) {
        localStorage.setItem('focusMessageId', String(messageIdParam))
      }
      if (createdAtParam) {
        localStorage.setItem('focusMessageCreatedAt', createdAtParam)
      }
    } catch { }
  }, [messageIdParam, createdAtParam])

  type SearchResponse = Message[] | { results?: Message[]; next?: string | null }
  const parseSearchResponse = (data: SearchResponse) => {
    if (Array.isArray(data)) return { results: data, next: null as string | null }
    return { results: Array.isArray(data?.results) ? data.results : [], next: data?.next ?? null }
  }
  const getNextPageNumber = (nextUrl: string | null) => {
    if (!nextUrl) return undefined
    try {
      const url = new URL(nextUrl, "http://localhost")
      const p = url.searchParams.get("page")
      const n = p ? Number(p) : NaN
      return Number.isFinite(n) && n > 0 ? n : undefined
    } catch {
      return undefined
    }
  }

  const searchQuery = useInfiniteQuery<{ results: Message[]; next: string | null }>({
    queryKey: ['global-message-search', debounced],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) => {
      const res = await api.get<SearchResponse>(
        `/api/messenger/conversations/search/?q=${encodeURIComponent(debounced)}&page=${pageParam}&page_size=20`,
        { signal },
      )
      return parseSearchResponse(res.data)
    },
    getNextPageParam: (lastPage) => getNextPageNumber(lastPage.next),
    enabled: !!currentUser && debounced.length >= 3,
  })

  const searchResults = useMemo(() => {
    const pages = searchQuery.data?.pages ?? []
    return pages.flatMap((p) => p.results)
  }, [searchQuery.data])

  const contactsQuery = useQuery<Contact[] | { results: Contact[] }>({
    queryKey: ["contacts"],
    queryFn: async () => {
      const res = await api.get<Contact[] | { results: Contact[] }>("/api/messenger/contacts/")
      return res.data
    },
    staleTime: 60_000,
    enabled: !!currentUser,
  })

  const contacts = useMemo(
    () => (Array.isArray(contactsQuery.data) ? contactsQuery.data : contactsQuery.data?.results ?? []),
    [contactsQuery.data],
  )

  const conversationQuery = useQuery<Conversation | null>({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null
      const id = Number(conversationId)
      if (!Number.isFinite(id)) return null
      const res = await api.get<Conversation>(`/api/messenger/conversations/${id}/`)
      return res.data
    },
    enabled: !!currentUser && !!conversationId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!conversationId) return
    if (selectedContact) return
    const conv = conversationQuery.data
    if (!conv) return
    const label = conv.title || (conv.is_group ? `Conversa #${conv.id}` : `Conversa #${conv.id}`)
    setSelectedContact({
      id: 0,
      username: label,
      email: "",
      first_name: undefined,
      last_name: undefined,
      is_online: false,
      group_names: [],
      is_staff: false,
      avatar_url: null,
      last_seen: null,
      status: "offline",
    })
  }, [conversationId, conversationQuery.data, selectedContact])

  const contactByUsername = useMemo(() => {
    const map = new Map<string, Contact>()
    for (const c of contacts) map.set(c.username, c)
    return map
  }, [contacts])

  const filteredResults = (Array.isArray(searchResults) ? searchResults : []).filter((m) => {
    if (filter === "media") return !!m.file_url && !!m.file_type && m.file_type.startsWith("image/")
    if (filter === "files") return !!m.file_url && (!m.file_type || !m.file_type.startsWith("image/"))
    if (hasAttachments) return !!m.file_url
    return true
  })

  const advancedFilteredResults = filteredResults.filter((m) => {
    const byKind = (() => {
      if (fileKind === "any") return true
      const type = (m.file_type || "").toLowerCase()
      const name = (m.file_name || "").toLowerCase()
      if (fileKind === "image") return !!m.file_url && type.startsWith("image/")
      if (fileKind === "video") return !!m.file_url && type.startsWith("video/")
      if (fileKind === "audio") return !!m.file_url && type.startsWith("audio/")
      if (fileKind === "pdf") return !!m.file_url && (type === "application/pdf" || name.endsWith(".pdf"))
      if (fileKind === "doc") return !!m.file_url && (name.endsWith(".doc") || name.endsWith(".docx"))
      if (fileKind === "xls") return !!m.file_url && (name.endsWith(".xls") || name.endsWith(".xlsx") || type.includes("sheet"))
      if (fileKind === "ppt") return !!m.file_url && (name.endsWith(".ppt") || name.endsWith(".pptx"))
      if (fileKind === "zip") return !!m.file_url && (name.endsWith(".zip") || type === "application/zip")
      return true
    })()

    // We can't easily get sender_username unless augmented. 
    // Usually it is sender_username in the Message interface from types/messenger.ts 
    const sender = m.sender_username || ""
    const byUser = userFilter.trim().length === 0
      ? true
      : sender.toLowerCase().includes(userFilter.trim().toLowerCase())

    const ts = new Date(m.created_at).getTime()
    const byFrom = dateFrom ? ts >= new Date(dateFrom).getTime() : true
    const byTo = dateTo ? ts <= new Date(dateTo).getTime() : true
    const byUnread = onlyUnread ? !m.is_read : true
    const byReactions = onlyWithReactions ? (m.reactions && m.reactions.length > 0) : true

    return byKind && byUser && byFrom && byTo && byUnread && byReactions
  })

  const bumpCreatedAtForBeforeParam = (createdAt: string) => {
    const ts = new Date(createdAt).getTime()
    if (!Number.isFinite(ts)) return createdAt
    return new Date(ts + 1).toISOString()
  }

  const highlight = (text: string, query: string) => {
    const q = query.trim()
    if (q.length < 3) return text
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) return text
    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + q.length)
    const after = text.slice(idx + q.length)
    return (
      <span>
        {before}
        <mark className="rounded-sm bg-primary/15 px-0.5">{match}</mark>
        {after}
      </span>
    )
  }

  const getConversationLabel = (m: Message) => {
    if (m.conversation_is_group) return m.conversation_title || "Grupo"
    const list = Array.isArray(m.conversation_participants_list) ? m.conversation_participants_list : []
    const other = list.find((u) => u !== currentUser?.username)
    return other || `#${m.conversation}`
  }

  const openMessage = async (msg: Message) => {
    try {
      if (!currentUser) return

      const focusCreatedAt = bumpCreatedAtForBeforeParam(msg.created_at)
      const focusMessageId = String(msg.id)

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('focusMessageId', focusMessageId)
          localStorage.setItem('focusMessageCreatedAt', focusCreatedAt)
        } catch { }
      }

      router.push(
        `/messenger?conversation=${msg.conversation}&message_id=${encodeURIComponent(focusMessageId)}&created_at=${encodeURIComponent(focusCreatedAt)}`
      )

      if (msg.conversation_is_group) {
        setSelectedContact({
          id: -(msg.conversation),
          username: msg.conversation_title || "Grupo",
          email: "",
          avatar_url: null,
          is_online: true,
          group_names: [],
          is_staff: false,
          last_seen: null,
          status: 'online',
        })
        return
      }

      const list = Array.isArray(msg.conversation_participants_list) ? msg.conversation_participants_list : []
      const otherUsername = list.find((u) => u !== currentUser.username)
      const targetContact = otherUsername ? contactByUsername.get(otherUsername) : undefined
      if (targetContact) {
        setSelectedContact(targetContact)
        return
      }

      const res = await api.get(`/api/messenger/conversations/${msg.conversation}/`)
      const conv = res.data

      const participantIds: number[] = Array.isArray(conv.participants) ? conv.participants : []
      const otherId = participantIds.find((id: number) => id !== currentUser.id)
      const targetId = otherId ?? currentUser.id

      const contactRes = await api.get(`/api/messenger/contacts/${targetId}/`)
      setSelectedContact(contactRes.data)
    } catch { }
  }

  useEffect(() => {
    if (!conversationId || !currentUser) return
    const fetchConversation = async () => {
      try {
        const res = await api.get(`/api/messenger/conversations/${conversationId}/`)
        const conversation = res.data

        let targetContact: Contact | null = null

        if (conversation.is_group) {
          targetContact = {
            id: -(conversation.id),
            username: conversation.title || "Grupo",
            email: "",
            avatar_url: null,
            is_online: true,
            group_names: [],
            is_staff: false,
            last_seen: null,
            status: 'online',
            first_name: "",
            last_name: ""
          }
        } else {
          const pList = conversation.participants || []
          type ParticipantObj = {
            id: number
            username?: string
            email?: string
            avatar_url?: string | null
            is_online?: boolean
            group_names?: string[]
            is_staff?: boolean
            last_seen?: string | null
            status?: string
            first_name?: string
            last_name?: string
          }
          const otherParticipant = (pList as unknown[]).find((p) => {
            if (typeof p === 'number') return p !== currentUser.id
            if (typeof p === 'object' && p && 'id' in p) {
              const id = (p as ParticipantObj).id
              return typeof id === 'number' && id !== currentUser.id
            }
            return false
          })

          if (otherParticipant) {
            const p = (typeof otherParticipant === 'number') ? null : (otherParticipant as ParticipantObj)
            targetContact = {
              id: p?.id || (typeof otherParticipant === 'number' ? otherParticipant : 0),
              username: p?.username || (conversation.participants_list?.[0] !== currentUser.username ? conversation.participants_list?.[0] : conversation.participants_list?.[1]) || "Contato",
              email: p?.email || "",
              avatar_url: p?.avatar_url || null,
              is_online: !!p?.is_online,
              group_names: p?.group_names || [],
              is_staff: !!p?.is_staff,
              last_seen: p?.last_seen || null,
              status: resolvePresenceStatus(p?.status, !!p?.is_online),
              first_name: p?.first_name || "",
              last_name: p?.last_name || ""
            }
          }
        }

        if (targetContact && (!selectedContact || selectedContact.id !== targetContact.id)) {
          setSelectedContact(targetContact)
        }
      } catch (error) {
        console.error("Failed to load conversation from URL", error)
      }
    }
    fetchConversation()
  }, [conversationId, currentUser, selectedContact])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center border border-border/50 rounded-2xl bg-background/50 backdrop-blur-sm shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="flex h-full items-center justify-center border border-border/50 rounded-2xl bg-background/50 backdrop-blur-sm shadow-sm">
        <div className="text-sm text-muted-foreground">Sessão expirada. Faça login novamente.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full border border-border/50 rounded-2xl overflow-hidden bg-background/50 backdrop-blur-sm shadow-sm flex-col">
      <div className="w-full p-3 sticky top-0 z-10 bg-background/70 backdrop-blur-sm border-b">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Buscar em mensagens..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 h-10"
          />
          <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Filtros de busca">
                <SlidersHorizontal className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:w-[420px] max-h-[calc(100vh-1.5rem)] overflow-hidden p-0">
              <SheetHeader className="border-b bg-muted/30 px-4 py-4 text-left">
                <SheetTitle>Filtros de busca</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 overflow-y-auto">
                <div className="space-y-4 px-4 py-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Tipo de resultado</label>
                  <div className="mt-2">
                    <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="media">Mídia</SelectItem>
                        <SelectItem value="files">Arquivos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="attachments"
                    checked={hasAttachments}
                    onCheckedChange={(v) => setHasAttachments(Boolean(v))}
                  />
                  <label htmlFor="attachments" className="text-sm">Somente com anexo</label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Tipo de arquivo</label>
                  <div className="mt-2">
                    <Select value={fileKind} onValueChange={(v) => setFileKind(v as typeof fileKind)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de arquivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Todos os tipos</SelectItem>
                        <SelectItem value="image">Imagem</SelectItem>
                        <SelectItem value="video">Vídeo</SelectItem>
                        <SelectItem value="audio">Áudio</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="doc">Word</SelectItem>
                        <SelectItem value="xls">Planilha</SelectItem>
                        <SelectItem value="ppt">Apresentação</SelectItem>
                        <SelectItem value="zip">ZIP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="onlyUnread"
                    checked={onlyUnread}
                    onCheckedChange={(v) => setOnlyUnread(Boolean(v))}
                  />
                  <label htmlFor="onlyUnread" className="text-sm">Apenas não lidas</label>
                </div>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id="onlyWithReactions"
                    checked={onlyWithReactions}
                    onCheckedChange={(v) => setOnlyWithReactions(Boolean(v))}
                  />
                  <label htmlFor="onlyWithReactions" className="text-sm">Com reação</label>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Usuário (remetente)</label>
                  <Input
                    placeholder="Nome de usuário"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">De</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Até</label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <Button className="w-full" onClick={() => setIsFiltersOpen(false)}>
                    Aplicar filtros
                  </Button>
                </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {debounced.length >= 3 && (
          <div className="mt-2 max-h-64 overflow-auto border rounded-xl bg-background/90 backdrop-blur-sm">
            {searchQuery.isLoading && (
              <div className="p-4 text-sm text-muted-foreground">Buscando...</div>
            )}
            {!searchQuery.isLoading && advancedFilteredResults.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Sem resultados</div>
            )}
            {advancedFilteredResults.map((m) => (
              <div key={`${m.conversation}-${m.id}`} className="p-3 border-b last:border-b-0 flex items-center gap-3 hover:bg-muted/50 cursor-pointer transition-colors" role="button" onClick={() => openMessage(m)}>
                <Badge variant="outline" className="text-[10px] px-2 truncate">{getConversationLabel(m)}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium">
                    {highlight(m.content || m.file_name || 'Mensagem', debounced)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="outline">Abrir</Button>
              </div>
            ))}
            {searchQuery.hasNextPage && (
              <div className="p-2 flex items-center justify-center">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={searchQuery.isFetchingNextPage}
                  onClick={() => searchQuery.fetchNextPage()}
                >
                  {searchQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={cn(
          "w-full md:w-80 border-r border-border/50 bg-background/50 md:flex flex-col",
          selectedContact ? "hidden" : "flex"
        )}>
          <ContactList
            onSelectContact={(c, convId) => {
              setSelectedContact(c)
              router.push(`/messenger?conversation=${convId}`)
            }}
            selectedContactId={selectedContact?.id}
            currentUser={currentUser || null}
          />
        </div>

        <div className={cn(
          "flex-1 bg-background/30 flex flex-col min-w-0",
          !selectedContact ? "hidden md:flex" : "flex"
        )}>
          {selectedContact ? (
            <ChatWindow
              contact={selectedContact}
              currentUser={currentUser || null}
              onBack={() => setSelectedContact(null)}
              conversationId={conversationId ? Number(conversationId) : null}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground flex-col gap-4">
              <div className="p-6 bg-primary/5 rounded-full border border-primary/10">
                <MessageSquareDashed className="w-10 h-10 text-primary/40" />
              </div>
              <p className="font-medium">Selecione uma conversa para começar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
