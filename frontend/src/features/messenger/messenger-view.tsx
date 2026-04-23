"use client"

import { useState, useEffect, useMemo } from "react"
import { ContactList } from "./contact-list"
import { ChatWindow } from "./chat-window"
import { Contact } from "@/types"
import { Message } from "@/types/messenger"
import type { Conversation } from "@/types/messenger"
import { MessageSquareDashed, Loader2, SlidersHorizontal, Search, Sparkles, MessageCircle, ArrowLeft } from "lucide-react"
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
import { AnimatePresence, motion } from "framer-motion"

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
      <div className="flex h-full items-center justify-center border border-white/10 rounded-[3rem] bg-white/5 backdrop-blur-xl shadow-2xl">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
      </div>
    )
  }

  if (!currentUser) {
    return (
      <div className="flex h-full items-center justify-center border border-white/10 rounded-[3rem] bg-white/5 backdrop-blur-xl shadow-2xl">
        <div className="text-sm font-black uppercase tracking-widest text-muted-foreground opacity-50">Sessão expirada. Autentique-se.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full border border-white/10 rounded-[3rem] overflow-hidden bg-white/5 backdrop-blur-2xl shadow-2xl flex-col relative animate-in fade-in duration-1000">
      {/* Premium Search & Filters Header */}
      <div className="w-full p-6 sticky top-0 z-20 bg-background/40 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              placeholder="Pesquisar mensagens e arquivos no histórico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 pl-11 rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 focus:ring-primary/20 transition-all font-medium shadow-inner"
            />
          </div>
          <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="outline" 
                size="icon" 
                className={cn("h-12 w-12 rounded-2xl border-white/10 transition-all shadow-lg", isFiltersOpen ? "bg-primary text-primary-foreground border-primary" : "bg-white/5 hover:bg-white/10")}
                aria-label="Filtros"
              >
                <SlidersHorizontal className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[90vw] sm:w-[420px] p-0 border-white/10 bg-background/95 backdrop-blur-3xl rounded-l-[3rem] overflow-hidden shadow-2xl">
              <SheetHeader className="px-8 pt-8 pb-6 bg-white/5 border-b border-white/10">
                <SheetTitle className="text-2xl font-black tracking-tighter uppercase">Atlas Search Engine</SheetTitle>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Refine sua busca no meta-histórico.</p>
              </SheetHeader>
              <div className="px-8 py-8 space-y-8 overflow-y-auto max-h-[calc(100vh-160px)]">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Domínio de Dados</label>
                  <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                    <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                      <SelectItem value="all" className="rounded-xl font-bold">Toda a Rede</SelectItem>
                      <SelectItem value="media" className="rounded-xl font-bold">Mídias Visuais</SelectItem>
                      <SelectItem value="files" className="rounded-xl font-bold">Documentos & Binários</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                  <div className="space-y-0.5">
                    <label htmlFor="attachments" className="text-[10px] font-black uppercase tracking-widest">Anexos Filtrados</label>
                    <p className="text-[9px] text-muted-foreground font-bold">Exibir apenas mensagens com arquivos.</p>
                  </div>
                  <Checkbox
                    id="attachments"
                    checked={hasAttachments}
                    onCheckedChange={(v) => setHasAttachments(Boolean(v))}
                    className="data-[state=checked]:bg-primary rounded-md"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Extensão de Arquivo</label>
                  <Select value={fileKind} onValueChange={(v) => setFileKind(v as typeof fileKind)}>
                    <SelectTrigger className="h-11 rounded-xl border-white/10 bg-white/5 font-bold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-white/10 bg-background/95 backdrop-blur-xl">
                      <SelectItem value="any" className="rounded-xl font-bold">Todos os formatos</SelectItem>
                      <SelectItem value="image" className="rounded-xl font-bold">Imagens (JPG, PNG...)</SelectItem>
                      <SelectItem value="video" className="rounded-xl font-bold">Vídeos (MP4, MKV...)</SelectItem>
                      <SelectItem value="audio" className="rounded-xl font-bold">Áudios (MP3, WAV...)</SelectItem>
                      <SelectItem value="pdf" className="rounded-xl font-bold">PDF Documents</SelectItem>
                      <SelectItem value="doc" className="rounded-xl font-bold">Word Documents</SelectItem>
                      <SelectItem value="xls" className="rounded-xl font-bold">Planilhas Excel</SelectItem>
                      <SelectItem value="ppt" className="rounded-xl font-bold">Apresentações</SelectItem>
                      <SelectItem value="zip" className="rounded-xl font-bold">Arquivos Compactos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                    <label htmlFor="onlyUnread" className="text-[10px] font-black uppercase tracking-widest">Não Lidas</label>
                    <Checkbox id="onlyUnread" checked={onlyUnread} onCheckedChange={(v) => setOnlyUnread(Boolean(v))} />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                    <label htmlFor="onlyWithReactions" className="text-[10px] font-black uppercase tracking-widest">Com Reações</label>
                    <Checkbox id="onlyWithReactions" checked={onlyWithReactions} onCheckedChange={(v) => setOnlyWithReactions(Boolean(v))} />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Filtrar por Usuário</label>
                  <Input
                    placeholder="@username"
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="h-11 rounded-xl border-white/10 bg-white/5 font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">De</label>
                    <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-11 rounded-xl border-white/10 bg-white/5 font-bold" />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 ml-1">Até</label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-11 rounded-xl border-white/10 bg-white/5 font-bold" />
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-background/80 backdrop-blur-md border-t border-white/10">
                 <Button className="w-full h-12 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20" onClick={() => setIsFiltersOpen(false)}>
                   Aplicar Filtros Avançados
                 </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <AnimatePresence>
          {debounced.length >= 3 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-4 max-h-80 overflow-auto rounded-3xl border border-white/10 bg-background/90 backdrop-blur-2xl shadow-2xl p-2"
            >
              {searchQuery.isLoading && (
                <div className="p-8 flex items-center justify-center gap-3">
                   <Loader2 className="h-5 w-5 animate-spin text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Escaneando base de dados...</span>
                </div>
              )}
              {!searchQuery.isLoading && advancedFilteredResults.length === 0 && (
                <div className="p-12 text-center space-y-2">
                   <div className="text-sm font-black uppercase tracking-widest text-muted-foreground/40">Nenhum registro encontrado</div>
                   <p className="text-[10px] text-muted-foreground font-bold italic">Tente outros parâmetros de busca.</p>
                </div>
              )}
              {advancedFilteredResults.map((m) => (
                <div key={`${m.conversation}-${m.id}`} className="group p-4 rounded-2xl hover:bg-white/5 cursor-pointer transition-all flex items-center gap-4" role="button" onClick={() => openMessage(m)}>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                     <MessageCircle className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                       <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest px-2 py-0 border-primary/20 text-primary">{getConversationLabel(m)}</Badge>
                       <span className="text-[9px] text-muted-foreground font-black opacity-40">{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm truncate font-bold text-foreground/90">
                      {highlight(m.content || m.file_name || 'Arquivo Compartilhado', debounced)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="rounded-xl font-black uppercase tracking-widest text-[9px] opacity-0 group-hover:opacity-100 transition-opacity">Abrir</Button>
                </div>
              ))}
              {searchQuery.hasNextPage && (
                <div className="p-4 flex items-center justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl font-black uppercase tracking-widest text-[9px] border-white/10"
                    disabled={searchQuery.isFetchingNextPage}
                    onClick={() => searchQuery.fetchNextPage()}
                  >
                    {searchQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais resultados"}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-0 flex-1 relative overflow-hidden">
        {/* Left Sidebar: Contact List */}
        <div className={cn(
          "w-full md:w-96 border-r border-white/5 bg-background/20 md:flex flex-col relative z-10",
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

        {/* Main Content: Chat Window */}
        <div className={cn(
          "flex-1 bg-white/5 flex flex-col min-w-0 relative z-0",
          !selectedContact ? "hidden md:flex" : "flex"
        )}>
          <AnimatePresence mode="wait">
            {selectedContact ? (
              <motion.div 
                key={selectedContact.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col"
              >
                <ChatWindow
                  contact={selectedContact}
                  currentUser={currentUser || null}
                  onBack={() => setSelectedContact(null)}
                  conversationId={conversationId ? Number(conversationId) : null}
                />
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full items-center justify-center text-muted-foreground flex-col gap-6 p-12 text-center"
              >
                <div className="relative">
                   <div className="absolute -inset-4 bg-primary/20 blur-3xl opacity-20 rounded-full animate-pulse" />
                   <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 shadow-2xl relative">
                      <MessageSquareDashed className="w-16 h-16 text-primary opacity-20" />
                   </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black tracking-tight text-foreground/80">Canal de Comunicação Criptografado</h3>
                  <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-[0.2em] max-w-xs leading-relaxed">
                    Selecione uma transmissão ativa na barra lateral para iniciar a sessão de chat.
                  </p>
                </div>
                <div className="flex gap-2">
                   <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 opacity-60">Servidores Atlas Operacionais</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Background Decorative Blur */}
      <div className="absolute -bottom-24 -left-24 h-96 w-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -top-24 -right-24 h-96 w-96 bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
    </div>
  )
}
