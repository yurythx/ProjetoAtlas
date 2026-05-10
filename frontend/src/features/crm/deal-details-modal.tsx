"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Box, Camera, Loader2, Search, Trash2, X, Zap, TrendingUp, BookOpen, Layers, Sparkles, ShieldCheck, Activity, Copy, ExternalLink, ChevronRight, LayoutDashboard, Clock, User, MessageSquareText, BrainCircuit, Network } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"

import { Deal, DealActivity, isCRMNetworkError, useCRM, useServiceCatalog, useCMDB, useXLA, useDealTopology, useKBSuggestions } from "./use-crm"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { cn, fixImageUrl } from "@/lib/utils"
import { api } from "@/lib/axios"
import { getDeadlineMeta, getPriorityMeta, getProgressMeta } from "./crm-visuals"
import { getColumnTransitionGuard, getDealColumnId, getDealColumnTitle, getPipelineColumns, getProgressValue, isDealDone, resolveColumnSemantics } from "./use-crm"
import { getUserDisplayName, getUserInitials } from "./crm-utils"
import { useCRMUsers } from "./use-crm-users"
import { MediaDialog } from "@/features/media/media-dialog"
import { enqueueOfflineDealAttachmentUpload, flushOfflineDealAttachmentUploads, listOfflineDealAttachmentUploads, removeOfflineDealAttachmentUpload } from "./offline-attachments"
import { useModules } from "@/hooks/use-modules"
import { usePermission } from "@/hooks/use-permission"

interface DealDetailsModalProps {
  deal: Deal
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SidebarItem({ 
  active, 
  icon: Icon, 
  label, 
  onClick, 
  badge,
  count,
  highlight
}: { 
  active: boolean; 
  icon: any; 
  label: string; 
  onClick: () => void;
  badge?: string | number;
  count?: number;
  highlight?: boolean;
}) {
  const displayBadge = badge ?? count
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-3 py-2.5 transition-all duration-200 group relative overflow-hidden",
        active 
          ? "bg-primary/10 text-primary shadow-sm" 
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
        highlight && "border border-amber-500/20 bg-amber-500/5"
      )}
    >
      {highlight && (
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-500/5 to-amber-500/0 animate-shimmer" />
      )}
      <div className="flex items-center gap-3 relative z-10">
        <Icon className={cn(
          "h-4 w-4 transition-transform group-hover:scale-110",
          active ? "text-primary" : "text-slate-400 group-hover:text-slate-600",
          highlight && "text-amber-500"
        )} />
        <span className={cn(
          "text-[11px] font-bold uppercase tracking-widest",
          active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
          highlight && "text-amber-600"
        )}>
          {label}
        </span>
      </div>
      {displayBadge !== undefined && (
        <span className={cn(
          "rounded-full px-1.5 py-0.5 text-[9px] font-black relative z-10",
          active ? "bg-primary text-white" : "bg-slate-200 text-slate-500",
          highlight && "bg-amber-500 text-white"
        )}>
          {displayBadge}
        </span>
      )}
    </button>
  )
}

type ActivityFilterId = "all" | "updates" | "moves" | "creation" | "automation"

const ACTIVITY_FILTER_OPTIONS: Array<{ id: ActivityFilterId; label: string }> = [
  { id: "all", label: "Tudo" },
  { id: "updates", label: "Updates" },
  { id: "moves", label: "Movimentações" },
  { id: "creation", label: "Criação" },
  { id: "automation", label: "Automações & IA" },
]

const EMPTY_ACTIVITIES: DealActivity[] = []
const EMPTY_ATTACHMENTS: NonNullable<Deal["attachments"]> = []

function getRelatedUserIds(deal: Deal) {
  const value = deal.custom_fields?.related_user_ids
  if (!Array.isArray(value)) return []
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function getActivityTypeLabel(activityType: DealActivity["activity_type"]) {
  if (activityType === "column_change" || activityType === "stage_change") return "Mudança de coluna"
  if (activityType === "creation") return "Criação do card"
  if (activityType === "note") return "Anotação"
  if (activityType === "automation") return "Automação"
  if (activityType === "ai_action") return "Ação de IA"
  if (activityType === "ai_suggestion") return "Sugestão de IA"
  return activityType
}

function matchesActivityFilter(
  activity: DealActivity,
  filter: ActivityFilterId
) {
  if (filter === "all") return true
  if (filter === "updates") return activity.activity_type === "note"
  if (filter === "moves") return activity.activity_type === "column_change" || activity.activity_type === "stage_change"
  if (filter === "creation") return activity.activity_type === "creation"
  if (filter === "automation") return activity.activity_type === "automation" || activity.activity_type === "ai_action" || activity.activity_type === "ai_suggestion"
  return true
}

export function DealDetailsModal({ deal, open, onOpenChange }: DealDetailsModalProps) {
  const { deals, pipelines, updateDeal, addDealNote, addDealAttachment, deleteDealAttachment, startSwarm, endSwarm } = useCRM()
  const { categories, items } = useServiceCatalog()
  const { cis } = useCMDB()
  const queryClient = useQueryClient()
  const { isModuleActive } = useModules()
  const { hasPermission } = usePermission()
  const currentDeal = useMemo(
    () => deals.find((item) => item.id === deal.id) || deal,
    [deal, deals]
  )
  const [draftDescription, setDraftDescription] = useState("")
  const [draftRecordType, setDraftRecordType] = useState<Deal["record_type"]>("incident")
  const [draftPriority, setDraftPriority] = useState<Deal["priority"]>("MEDIUM")
  const [aiPrioritySuggestion, setAiPrioritySuggestion] = useState<{ suggested_priority?: string; suggested_record_type?: string; reasoning?: string } | null>(null)
  const [isLoadingAiPriority, setIsLoadingAiPriority] = useState(false)
  const [draftColumnId, setDraftColumnId] = useState("")
  const [draftServiceItemId, setDraftServiceItemId] = useState<string>("none")
  const [draftAffectedCis, setDraftAffectedCis] = useState<number[]>([])
  const [draftRelatedUsers, setDraftRelatedUsers] = useState<number[]>([])
  const [draftProgress, setDraftProgress] = useState("0")
  const [draftRiskLevel, setDraftRiskLevel] = useState<Deal["risk_level"] | "none">("none")
  const [draftChangeJustification, setDraftChangeJustification] = useState("")
  const [draftImplementationPlan, setDraftImplementationPlan] = useState("")
  const [draftBackoutPlan, setDraftBackoutPlan] = useState("")
  const [draftTestPlan, setDraftTestPlan] = useState("")
  const [draftRootCause, setDraftRootCause] = useState("")
  const [draftResolutionSteps, setDraftResolutionSteps] = useState("")
  const [draftIsKnownError, setDraftIsKnownError] = useState(false)
  const [userSearch, setUserSearch] = useState("")
  const [draftUpdateNote, setDraftUpdateNote] = useState("")
  const [activityFilter, setActivityFilter] = useState<ActivityFilterId>("all")
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "images" | "history" | "cis" | "governance" | "xla" | "topology" | "kb" | "ai_assistant">("details")
  const { data: xlaFeedbacks = [], createFeedback: submitXla } = useXLA(currentDeal.id)
  const { data: topologyData, isLoading: isLoadingTopology } = useDealTopology(currentDeal.id)
  const [imagesFilter, setImagesFilter] = useState<"all" | "before" | "during" | "after">("all")
  const updateTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [draftAttachmentPhase, setDraftAttachmentPhase] = useState<"before" | "during" | "after">("during")
  const [draftAttachmentCaption, setDraftAttachmentCaption] = useState("")
  const [pendingAttachmentPreviews, setPendingAttachmentPreviews] = useState<
    Array<{ id: string; url: string; title: string; phase: "before" | "during" | "after"; caption: string }>
  >([])
  const [queuedAttachmentPreviews, setQueuedAttachmentPreviews] = useState<
    Array<{ id: string; url: string; title: string; phase: "before" | "during" | "after"; caption: string; isObjectUrl: boolean }>
  >([])
  const queueAbortRef = useRef<AbortController | null>(null)
  const queuedUrlsRef = useRef<string[]>([])

  const { data: users = [] } = useCRMUsers(true)

  const columns = useMemo(
    () => pipelines.flatMap((pipeline) => getPipelineColumns(pipeline)),
    [pipelines]
  )

  useEffect(() => {
    if (!open) return
    setDraftDescription(currentDeal.description || "")
    setDraftRecordType(currentDeal.record_type || "incident")
    setDraftPriority(currentDeal.priority)
    setDraftColumnId(String(getDealColumnId(currentDeal) ?? ""))
    setDraftRelatedUsers(getRelatedUserIds(currentDeal))
    setDraftProgress(getProgressValue(currentDeal).toString())
    setDraftServiceItemId(
      typeof currentDeal.service_item === "object" && currentDeal.service_item !== null
        ? String(currentDeal.service_item.id)
        : currentDeal.service_item ? String(currentDeal.service_item) : "none"
    )
    setUserSearch("")
    setDraftAffectedCis(
      (Array.isArray(currentDeal.affected_cis) ? currentDeal.affected_cis : []).map((ci) => (typeof ci === "object" ? ci.id : ci))
    )
    setDraftRiskLevel(currentDeal.risk_level || "none")
    setDraftChangeJustification(currentDeal.change_justification || "")
    setDraftImplementationPlan(currentDeal.implementation_plan || "")
    setDraftBackoutPlan(currentDeal.backout_plan || "")
    setDraftTestPlan(currentDeal.test_plan || "")
    setDraftRootCause(currentDeal.root_cause || "")
    setDraftResolutionSteps(currentDeal.resolution_steps || "")
    setDraftIsKnownError(currentDeal.is_known_error || false)
    setUserSearch("")
    setDraftUpdateNote("")
    setActivityFilter("all")
  }, [currentDeal, open])

  const selectedUsers = useMemo(
    () => (Array.isArray(users) ? users : []).filter((user) => draftRelatedUsers.includes(user.id)),
    [draftRelatedUsers, users]
  )
  const filteredUsers = useMemo(() => {
    const normalizedQuery = userSearch.trim().toLowerCase()
    const usersArray = Array.isArray(users) ? users : []
    if (!normalizedQuery) return usersArray

    return usersArray.filter((user) => {
      const displayName = getUserDisplayName(user).toLowerCase()
      const email = user.email?.toLowerCase() || ""
      const username = user.username.toLowerCase()
      return (
        displayName.includes(normalizedQuery) ||
        email.includes(normalizedQuery) ||
        username.includes(normalizedQuery)
      )
    })
  }, [userSearch, users])
  const ownerUser = (Array.isArray(users) ? users : []).find((user) => user.id === currentDeal.owner)
  const selectedColumn = draftColumnId ? columns.find((column) => column.id === Number(draftColumnId)) : undefined
  const selectedColumnSemantics = resolveColumnSemantics(selectedColumn)
  const draftPriorityMeta = getPriorityMeta(draftPriority)
  const currentPriorityMeta = getPriorityMeta(currentDeal.priority)
  const deadlineMeta = getDeadlineMeta(currentDeal.closing_date, isDealDone(currentDeal, pipelines))
  const activities = Array.isArray(currentDeal.activities) ? currentDeal.activities : EMPTY_ACTIVITIES
  const latestActivity = Array.isArray(activities) ? activities[0] : undefined
  const latestManualUpdate = useMemo(
    () =>
      activities
        .filter((activity) => activity.activity_type === "note")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0],
    [activities]
  )
  const filteredActivities = useMemo(
    () => (Array.isArray(activities) ? activities : []).filter((activity) => matchesActivityFilter(activity, activityFilter)),
    [activities, activityFilter]
  )
  const activityFilterCounts = useMemo(
    () => {
      const activitiesArray = Array.isArray(activities) ? activities : []
      return ACTIVITY_FILTER_OPTIONS.reduce<Record<ActivityFilterId, number>>(
        (accumulator, option) => {
          accumulator[option.id] = activitiesArray.filter((activity) => matchesActivityFilter(activity, option.id)).length
          return accumulator
        },
        {
          all: 0,
          updates: 0,
          moves: 0,
          creation: 0,
          automation: 0,
        }
      )
    },
    [activities]
  )
  const currentProgress = getProgressValue(currentDeal)
  const normalizedDraftProgressValue = Number(draftProgress)
  const safeDraftProgress =
    Number.isFinite(normalizedDraftProgressValue) ? Math.max(0, Math.min(100, Math.round(normalizedDraftProgressValue))) : 0
  const draftProgressMeta = getProgressMeta(safeDraftProgress)
  const hasChanges =
    draftDescription !== (currentDeal.description || "") ||
    draftRecordType !== currentDeal.record_type ||
    draftPriority !== currentDeal.priority ||
    draftColumnId !== String(getDealColumnId(currentDeal) ?? "") ||
    draftServiceItemId !== (
      typeof currentDeal.service_item === "object" && currentDeal.service_item !== null
        ? String(currentDeal.service_item.id)
        : currentDeal.service_item ? String(currentDeal.service_item) : "none"
    ) ||
    JSON.stringify([...draftAffectedCis].sort((a, b) => a - b)) !==
      JSON.stringify(
        [...(Array.isArray(currentDeal.affected_cis) ? currentDeal.affected_cis : [])]
          .map((ci) => (typeof ci === "object" ? ci.id : ci))
          .sort((a, b) => a - b)
      ) ||
    draftRiskLevel !== (currentDeal.risk_level || "none") ||
    draftChangeJustification !== (currentDeal.change_justification || "") ||
    draftImplementationPlan !== (currentDeal.implementation_plan || "") ||
    draftBackoutPlan !== (currentDeal.backout_plan || "") ||
    draftTestPlan !== (currentDeal.test_plan || "") ||
    draftRootCause !== (currentDeal.root_cause || "") ||
    draftResolutionSteps !== (currentDeal.resolution_steps || "") ||
    draftIsKnownError !== (currentDeal.is_known_error || false) ||
    safeDraftProgress !== currentProgress ||
    JSON.stringify([...draftRelatedUsers].sort((a, b) => a - b)) !==
      JSON.stringify([...getRelatedUserIds(currentDeal)].sort((a, b) => a - b))
  const selectedColumnGuard = getColumnTransitionGuard(currentDeal, selectedColumn, deals, pipelines)

  const resetDraft = () => {
    setDraftDescription(currentDeal.description || "")
    setDraftRecordType(currentDeal.record_type || "incident")
    setDraftPriority(currentDeal.priority)
    setDraftColumnId(String(getDealColumnId(currentDeal) ?? ""))
    setDraftRelatedUsers(getRelatedUserIds(currentDeal))
    setDraftProgress(getProgressValue(currentDeal).toString())
    setDraftServiceItemId(
      typeof currentDeal.service_item === "object" && currentDeal.service_item !== null
        ? String(currentDeal.service_item.id)
        : currentDeal.service_item ? String(currentDeal.service_item) : "none"
    )
    setUserSearch("")
    setDraftAffectedCis(
      (Array.isArray(currentDeal.affected_cis) ? currentDeal.affected_cis : []).map((ci) => (typeof ci === "object" ? ci.id : ci))
    )
    setDraftRiskLevel(currentDeal.risk_level || "none")
    setDraftChangeJustification(currentDeal.change_justification || "")
    setDraftImplementationPlan(currentDeal.implementation_plan || "")
    setDraftBackoutPlan(currentDeal.backout_plan || "")
    setDraftTestPlan(currentDeal.test_plan || "")
    setDraftRootCause(currentDeal.root_cause || "")
    setDraftResolutionSteps(currentDeal.resolution_steps || "")
    setDraftIsKnownError(currentDeal.is_known_error || false)
  }

  const handleToggleRelatedUser = (userId: number, checked: boolean) => {
    setDraftRelatedUsers((current) =>
      checked ? [...current, userId] : current.filter((id) => id !== userId)
    )
  }

  const handleSave = async () => {
    const nextCustomFields = { ...(currentDeal.custom_fields || {}) } as Record<string, unknown>

    if (draftRelatedUsers.length > 0) {
      nextCustomFields.related_user_ids = draftRelatedUsers
    } else {
      delete nextCustomFields.related_user_ids
    }

    nextCustomFields.progress_percentage = safeDraftProgress
    const numericColumn = Number(draftColumnId)
    const column = Number.isFinite(numericColumn) && numericColumn > 0 ? numericColumn : undefined

    await updateDeal.mutateAsync({
      id: currentDeal.id,
      description: draftDescription,
      record_type: draftRecordType,
      priority: draftPriority,
      column,
      service_item: draftServiceItemId === "none" ? undefined : Number(draftServiceItemId),
      affected_cis: draftAffectedCis,
      risk_level: draftRiskLevel === "none" ? null : draftRiskLevel,
      change_justification: draftChangeJustification,
      implementation_plan: draftImplementationPlan,
      backout_plan: draftBackoutPlan,
      test_plan: draftTestPlan,
      root_cause: draftRootCause,
      resolution_steps: draftResolutionSteps,
      is_known_error: draftIsKnownError,
      custom_fields: nextCustomFields,
    })
  }

  const handlePublishUpdate = async () => {
    const description = draftUpdateNote.trim()
    if (!description) return

    await addDealNote.mutateAsync({
      dealId: currentDeal.id,
      description,
    })
    setDraftUpdateNote("")
  }

  const attachments = currentDeal.attachments ?? EMPTY_ATTACHMENTS
  const totalQueuedAttachments = queuedAttachmentPreviews.length
  const totalPendingUploads = pendingAttachmentPreviews.length
  const canOpenMessenger = Boolean(currentDeal.messenger_conversation) && isModuleActive("messenger") && hasPermission("messenger.view")
  const canPublishUpdate = hasPermission("crm.deal_comment")
  const canMentionUsers = canPublishUpdate
  const canAttachFiles = hasPermission("crm.deal_attach")
  const canDeleteAttachments = hasPermission("crm.deal_attach_delete")

  const mentionSuggestions = useMemo(() => {
    if (!mentionOpen) return []
    const usersArray = Array.isArray(users) ? users : []
    const q = mentionQuery.trim().toLowerCase()
    if (!q) return usersArray.slice(0, 8)
    return usersArray
      .filter((u) => {
        const name = getUserDisplayName(u).toLowerCase()
        return u.username.toLowerCase().includes(q) || name.includes(q) || (u.email || "").toLowerCase().includes(q)
      })
      .slice(0, 8)
  }, [mentionOpen, mentionQuery, users])

  useEffect(() => {
    if (!mentionOpen) {
      setMentionIndex(0)
      return
    }
    setMentionIndex(0)
  }, [mentionOpen, mentionQuery])

  useEffect(() => {
    if (!mentionOpen) return
    setMentionIndex((current) => {
      if (mentionSuggestions.length === 0) return 0
      return Math.max(0, Math.min(current, mentionSuggestions.length - 1))
    })
  }, [mentionOpen, mentionSuggestions.length])

  useEffect(() => {
    if (activeTab === "history") return
    if (!mentionOpen) return
    setMentionOpen(false)
    setMentionQuery("")
    setMentionIndex(0)
  }, [activeTab, mentionOpen])

  const updateMentionState = useCallback(
    (value: string, cursor: number | null) => {
      if (!canMentionUsers) {
        setMentionOpen(false)
        setMentionQuery("")
        return
      }
      const pos = cursor ?? value.length
      const before = value.slice(0, pos)
      const match = before.match(/@([a-zA-Z0-9._-]{0,50})$/)
      if (!match) {
        setMentionOpen(false)
        setMentionQuery("")
        return
      }
      setMentionOpen(true)
      setMentionQuery(match[1] || "")
    },
    [canMentionUsers]
  )

  const insertMention = useCallback(
    (username: string) => {
      const el = updateTextareaRef.current
      const value = draftUpdateNote
      const cursor = el?.selectionStart ?? value.length
      const before = value.slice(0, cursor)
      const after = value.slice(cursor)
      const match = before.match(/@([a-zA-Z0-9._-]{0,50})$/)
      if (!match) return
      const start = before.length - match[0].length
      const nextValue = `${value.slice(0, start)}@${username} ${after}`
      setDraftUpdateNote(nextValue)
      setMentionOpen(false)
      setMentionQuery("")
      requestAnimationFrame(() => {
        const nextCursor = start + username.length + 2
        if (el) {
          el.focus()
          el.setSelectionRange(nextCursor, nextCursor)
        }
      })
    },
    [draftUpdateNote]
  )

  const filteredQueuedAttachmentPreviews = useMemo(() => {
    const list = Array.isArray(queuedAttachmentPreviews) ? queuedAttachmentPreviews : []
    if (imagesFilter === "all") return list
    return list.filter((item) => item.phase === imagesFilter)
  }, [imagesFilter, queuedAttachmentPreviews])

  const filteredPendingAttachmentPreviews = useMemo(() => {
    const list = Array.isArray(pendingAttachmentPreviews) ? pendingAttachmentPreviews : []
    if (imagesFilter === "all") return list
    return list.filter((item) => item.phase === imagesFilter)
  }, [imagesFilter, pendingAttachmentPreviews])

  const filteredAttachments = useMemo(() => {
    const list = Array.isArray(attachments) ? attachments : []
    if (imagesFilter === "all") return list
    return list.filter((item) => item.phase === imagesFilter)
  }, [attachments, imagesFilter])

  useEffect(() => {
    if (!open) return
    setActiveTab("details")
    setImagesFilter("all")
    setMentionOpen(false)
    setMentionQuery("")
    setMentionIndex(0)
  }, [open, currentDeal.id])

  useEffect(() => {
    if (!open) return
    let disposed = false

    void (async () => {
      const queued = await listOfflineDealAttachmentUploads(currentDeal.id)
      if (disposed) return
      const previews = queued.map((item) => {
        if (item.source === "media") {
          return {
            id: item.id,
            url: fixImageUrl(item.previewUrl),
            title: item.title,
            phase: item.phase,
            caption: item.caption,
            isObjectUrl: false,
          }
        }
        const url = URL.createObjectURL(item.blob)
        return {
          id: item.id,
          url,
          title: item.fileName,
          phase: item.phase,
          caption: item.caption,
          isObjectUrl: true,
        }
      })
      queuedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      queuedUrlsRef.current = previews.filter((p) => p.isObjectUrl).map((p) => p.url)
      setQueuedAttachmentPreviews(previews)
    })()

    return () => {
      disposed = true
      queuedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      queuedUrlsRef.current = []
    }
  }, [open, currentDeal.id])

  const handleFlushQueuedAttachments = useCallback(async () => {
    if (queueAbortRef.current) {
      queueAbortRef.current.abort()
    }
    const controller = new AbortController()
    queueAbortRef.current = controller
    const result = await flushOfflineDealAttachmentUploads({ dealId: currentDeal.id, signal: controller.signal })
    if (result.uploaded > 0) {
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] })
      toast.success(`Sincronizado: ${result.uploaded} foto(s) enviada(s).`)
    }
    const queued = await listOfflineDealAttachmentUploads(currentDeal.id)
    const previews = queued.map((item) => {
      if (item.source === "media") {
        return {
          id: item.id,
          url: fixImageUrl(item.previewUrl),
          title: item.title,
          phase: item.phase,
          caption: item.caption,
          isObjectUrl: false,
        }
      }
      return {
        id: item.id,
        url: URL.createObjectURL(item.blob),
        title: item.fileName,
        phase: item.phase,
        caption: item.caption,
        isObjectUrl: true,
      }
    })
    queuedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    queuedUrlsRef.current = previews.filter((p) => p.isObjectUrl).map((p) => p.url)
    setQueuedAttachmentPreviews(previews)
  }, [currentDeal.id, queryClient])

  const handleRemoveQueuedAttachment = useCallback(async (id: string) => {
    const item = queuedAttachmentPreviews.find((preview) => preview.id === id)
    if (item?.isObjectUrl) {
      URL.revokeObjectURL(item.url)
      queuedUrlsRef.current = queuedUrlsRef.current.filter((url) => url !== item.url)
    }
    setQueuedAttachmentPreviews((prev) => prev.filter((preview) => preview.id !== id))
    await removeOfflineDealAttachmentUpload(id)
    toast.success("Foto pendente removida.")
  }, [queuedAttachmentPreviews])

  const handleCapturePhoto = async (file: File | null) => {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    const previewId =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.random()}`
    const caption = draftAttachmentCaption.trim()
    const phase = draftAttachmentPhase
    setPendingAttachmentPreviews((prev) => [{ id: previewId, url: previewUrl, title: file.name, phase, caption }, ...prev])
    let keepPreviewUrl = false
    try {
      await addDealAttachment.mutateAsync({
        dealId: currentDeal.id,
        file,
        kind: "photo",
        phase,
        caption,
        title: file.name,
      })
      setDraftAttachmentCaption("")
    } catch (err) {
      if (isCRMNetworkError(err)) {
        const queued = await enqueueOfflineDealAttachmentUpload({
          dealId: currentDeal.id,
          source: "file",
          blob: file,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          kind: "photo",
          phase,
          caption,
        })
        keepPreviewUrl = true
        setQueuedAttachmentPreviews((prev) => [{ id: queued.id, url: previewUrl, title: file.name, phase, caption, isObjectUrl: true }, ...prev])
        queuedUrlsRef.current = [previewUrl, ...queuedUrlsRef.current]
        setPendingAttachmentPreviews((prev) => prev.filter((item) => item.id !== previewId))
        toast.success("Sem conexão: foto salva localmente e será enviada quando voltar a internet.")
        return
      }
      throw err
    } finally {
      setPendingAttachmentPreviews((prev) => prev.filter((item) => item.id !== previewId))
      if (!keepPreviewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-[calc(100vw-1.5rem)] sm:w-[95vw] lg:w-[1120px]",
          "max-h-[95vh] overflow-hidden border border-white/10 bg-background/30 p-0",
          "backdrop-blur-3xl rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl",
          "grid grid-rows-[auto_1fr] animate-in zoom-in-95 duration-300",
          activeTab === "images" ? "lg:max-w-[1440px]" : "lg:max-w-[1120px]"
        )}
      >
        {currentDeal.swarm?.is_active && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 sm:px-6 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500 p-2 rounded-lg shadow-lg shadow-amber-500/20">
                <Zap className="h-4 w-4 text-white fill-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-700 uppercase tracking-tighter sm:tracking-wider">War Room Ativa (Swarming)</p>
                <p className="text-[10px] sm:text-xs text-amber-600/80 font-medium">Equipe colaborativa focada na resolução estratégica.</p>
              </div>
            </div>
            <div className="flex -space-x-2">
              {(Array.isArray(currentDeal.swarm.participant_names) ? currentDeal.swarm.participant_names : []).slice(0, 5).map((name, i) => (
                <Avatar key={i} className="h-7 w-7 sm:h-8 sm:w-8 border-2 border-white shadow-sm">
                  <AvatarFallback className="text-[8px] sm:text-[10px] bg-amber-100 text-amber-900 font-bold">{getUserInitials(name)}</AvatarFallback>
                </Avatar>
              ))}
              {(Array.isArray(currentDeal.swarm.participant_names) ? currentDeal.swarm.participant_names : []).length > 5 && (
                <div className="h-7 w-7 sm:h-8 sm:w-8 border-2 border-white bg-amber-200 rounded-full flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-amber-900 z-10">
                  +{(Array.isArray(currentDeal.swarm.participant_names) ? currentDeal.swarm.participant_names : []).length - 5}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogHeader className="border-b bg-muted/20 px-6 py-6 text-left shrink-0">
          <DialogTitle className="sr-only">Detalhes do Chamado</DialogTitle>
          <DialogDescription className="sr-only">
            Informações detalhadas, histórico e ações relacionadas a este chamado.
          </DialogDescription>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3">{selectedColumn?.title || getDealColumnTitle(currentDeal)}</Badge>
                <Badge className={cn(draftPriorityMeta.className, "rounded-full px-3 text-[9px] font-black uppercase tracking-widest")}>{draftPriorityMeta.label}</Badge>
                <Badge className={cn(deadlineMeta.badgeClassName, "rounded-full px-3 text-[9px] font-black uppercase tracking-widest")}>{deadlineMeta.label}</Badge>
                {currentDeal.sla_status && (
                  <Badge className={cn(
                    "uppercase font-black px-2 tracking-widest rounded-full",
                    currentDeal.sla_status === "breached" ? "bg-red-600 text-white" : 
                    currentDeal.sla_status === "at_risk" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
                  )}>
                    SLA: {currentDeal.sla_status === "breached" ? "Violado" : currentDeal.sla_status === "at_risk" ? "Em Risco" : "OK"}
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-3xl font-black uppercase italic tracking-tighter">{currentDeal.title}</DialogTitle>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-3 w-3 text-primary" />
                  </div>
                  {currentDeal.contact_name}
                </div>
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  {latestActivity ? formatDistanceToNow(new Date(latestActivity.created_at), { addSuffix: true, locale: ptBR }) : "Sem atividade"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end gap-1 mr-4">
                 <div className="flex items-center gap-3 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progresso</span>
                    <span className="text-xs font-black text-primary">{safeDraftProgress}%</span>
                 </div>
                 <div className="w-32 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className={cn("h-full transition-all duration-500", draftProgressMeta.barClassName)} style={{ width: `${safeDraftProgress}%` }} />
                 </div>
              </div>

              {currentDeal.swarm?.is_active ? (
                <Button 
                  variant="destructive"
                  onClick={() => endSwarm.mutate(currentDeal.id)}
                  className="rounded-xl font-black uppercase tracking-widest text-[10px] bg-red-600"
                >
                  <X className="mr-2 h-4 w-4" /> Finalizar Swarm
                </Button>
              ) : (
                <Button 
                  onClick={() => startSwarm.mutate(currentDeal.id)}
                  className="rounded-xl font-black uppercase tracking-widest text-[10px] bg-amber-500 text-white"
                >
                  <Zap className="mr-2 h-4 w-4 fill-white" /> Swarming
                </Button>
              )}

              <Button 
                onClick={handleSave} 
                disabled={!hasChanges || updateDeal.isPending}
                className="rounded-xl font-black uppercase tracking-widest text-[10px] px-6"
              >
                {updateDeal.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          <aside className="w-64 border-r bg-muted/10 p-4 flex flex-col gap-6 overflow-y-auto shrink-0">
             <div className="space-y-1">
                <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Operação</p>
                <SidebarItem 
                  active={activeTab === 'overview'} 
                  icon={LayoutDashboard} 
                  label="Visão Geral" 
                  onClick={() => setActiveTab('overview')} 
                />
                <SidebarItem 
                  active={activeTab === 'details'} 
                  icon={MessageSquareText} 
                  label="Atendimento" 
                  onClick={() => setActiveTab('details')} 
                />
                <SidebarItem 
                  active={activeTab === 'images'} 
                  icon={Camera} 
                  label="Galeria de Fotos" 
                  count={attachments.length + totalQueuedAttachments + totalPendingUploads}
                  onClick={() => setActiveTab('images')} 
                />
             </div>

             <div className="space-y-1">
                <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">ITIL & Ativos</p>
                <SidebarItem 
                  active={activeTab === 'governance'} 
                  icon={ShieldCheck} 
                  label="Governança" 
                  onClick={() => setActiveTab('governance')} 
                />
                <SidebarItem 
                  active={activeTab === 'cis'} 
                  icon={Box} 
                  label="ICs Afetados" 
                  count={draftAffectedCis.length}
                  onClick={() => setActiveTab('cis')} 
                />
                <SidebarItem 
                  active={activeTab === 'topology'} 
                  icon={Layers} 
                  label="Topologia 360°" 
                  onClick={() => setActiveTab('topology')} 
                />
             </div>

             <div className="space-y-1">
                <p className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Inteligência</p>
                {isModuleActive("ai") && (
                  <SidebarItem 
                    active={activeTab === 'ai_assistant'} 
                    icon={Sparkles} 
                    label="Assistente IA" 
                    highlight
                    onClick={() => setActiveTab('ai_assistant')} 
                  />
                )}
                {isModuleActive("articles") && (
                  <SidebarItem 
                    active={activeTab === 'kb'} 
                    icon={BookOpen} 
                    label="Conhecimento" 
                    onClick={() => setActiveTab('kb')} 
                  />
                )}
             </div>

             <div className="mt-auto pt-4 border-t">
                <SidebarItem 
                  active={activeTab === 'xla'} 
                  icon={TrendingUp} 
                  label="Experiência XLA" 
                  onClick={() => setActiveTab('xla')} 
                />
                <SidebarItem 
                  active={activeTab === 'history'} 
                  icon={Clock} 
                  label="Linha do Tempo" 
                  count={activities.length}
                  onClick={() => setActiveTab('history')} 
                />
             </div>
          </aside>

          <main className="flex-1 overflow-y-auto bg-background/50">
            <Tabs value={activeTab} className="h-full">

            {isModuleActive("articles") && (
              <TabsContent value="kb" className="mt-0 space-y-6 p-4 sm:p-6">
                <KnowledgeBaseTab dealId={currentDeal.id} />
              </TabsContent>
            )}

            {isModuleActive("ai") && (
              <TabsContent value="ai_assistant" className="mt-0 space-y-6 p-4 sm:p-6">
                <div className="grid gap-6 xl:grid-cols-[1fr_350px]">
                  <div className="space-y-6">
                    <section className="rounded-3xl border-2 border-primary/20 bg-primary/5 p-8 relative overflow-hidden group shadow-xl">
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <Sparkles className="h-40 w-40 text-primary" />
                      </div>

                      <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                            <BrainCircuit className="h-6 w-6 text-white" />
                          </div>
                          <h3 className="text-xl font-black uppercase italic tracking-tighter">Atlas Predictor Engine</h3>
                        </div>

                        <div className="grid gap-6">
                           <div className="p-6 rounded-2xl bg-background/80 border border-primary/10 shadow-sm backdrop-blur-md">
                              <h4 className="text-[10px] font-black uppercase text-primary mb-3 tracking-[0.2em]">Diagnóstico de Causa Raiz</h4>
                              <p className="text-lg font-semibold leading-relaxed italic text-slate-700">
                                "{currentDeal.ai_metadata?.suggested_diagnosis || "O Advisor está analisando as dependências do CMDB e o histórico de incidentes similares para gerar um diagnóstico preciso..."}"
                              </p>
                           </div>

                           <div className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] px-1">Logic of Resolution</h4>
                              <div className="grid gap-3">
                                {Array.isArray(currentDeal.ai_metadata?.resolution_steps) ? currentDeal.ai_metadata.resolution_steps.map((step: string, idx: number) => (
                                  <div key={idx} className="flex gap-4 p-4 rounded-xl bg-white/50 border border-slate-100 items-center group/step hover:border-primary/20 transition-all">
                                    <span className="text-primary font-black text-lg opacity-40 group-hover/step:opacity-100 transition-opacity">0{idx + 1}</span>
                                    <span className="text-sm font-medium text-slate-600">{step}</span>
                                  </div>
                                )) : (
                                  <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-sm text-slate-400 italic">
                                    Aguardando processamento de telemetria para sugerir passos...
                                  </div>
                                )}
                              </div>
                           </div>
                        </div>
                      </div>
                    </section>

                    <AIAssistantTab dealId={currentDeal.id} />
                  </div>

                  <div className="space-y-6">
                    <section className="rounded-2xl border bg-card p-6 shadow-sm">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Métricas Predictivas</h4>
                       <div className="space-y-8">
                          <div className="space-y-3">
                             <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">Probabilidade de SLA Breach</span>
                                <span className={cn(
                                  "text-2xl font-black",
                                  (currentDeal.ai_metadata?.risk_score || 0) > 70 ? "text-rose-500" : "text-emerald-500"
                                )}>
                                  {currentDeal.ai_metadata?.risk_score || "12"}%
                                </span>
                             </div>
                             <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full transition-all duration-1000", (currentDeal.ai_metadata?.risk_score || 0) > 70 ? "bg-rose-500" : "bg-emerald-500")} 
                                  style={{ width: `${currentDeal.ai_metadata?.risk_score || 12}%` }} 
                                />
                             </div>
                          </div>

                          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 text-center">
                             <span className="text-[10px] font-black uppercase text-primary/60 block mb-1">Impacto XLA Sugerido</span>
                             <span className="text-3xl font-black text-primary tracking-tighter">{currentDeal.ai_metadata?.xla_impact || "ALTO"}</span>
                          </div>
                       </div>
                    </section>
                  </div>
                </div>
              </TabsContent>
            )}

            <TabsContent value="overview" className="mt-0 space-y-6 p-4 sm:p-6">
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fase do Fluxo (VSM)</p>
                  <div className="mt-3">
                    <Badge variant="outline" className="text-sm bg-primary/10 border-primary/20">
                      {selectedColumn?.value_stream_phase ? (
                         selectedColumn.value_stream_phase === 'demand' ? 'Demanda' :
                         selectedColumn.value_stream_phase === 'product_design' ? 'Design' :
                         selectedColumn.value_stream_phase === 'creation' ? 'Criação' :
                         selectedColumn.value_stream_phase === 'onboarding' ? 'Entrega' : 'Valor'
                      ) : 'Não mapeado'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Posição atual no Fluxo de Valor Digital (DPSM).
                  </p>
                </div>

                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coluna atual</p>
                  <div className="mt-3">
                    <Badge variant="secondary" className="text-sm">
                      {selectedColumn?.title || getDealColumnTitle(currentDeal)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    O card segue a coluna selecionada no painel e persiste ao salvar.
                  </p>
                  {selectedColumnSemantics.wip_limit ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Limite WIP: {selectedColumnSemantics.wip_limit} card{selectedColumnSemantics.wip_limit === 1 ? "" : "s"}.
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prioridade</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary/80 hover:bg-primary/10 rounded-xl"
                      disabled={isLoadingAiPriority}
                      onClick={async () => {
                        setIsLoadingAiPriority(true)
                        setAiPrioritySuggestion(null)
                        try {
                          const res = await api.get(`/api/ai/deals/${currentDeal.id}/priority-suggest/`)
                          setAiPrioritySuggestion(res.data)
                        } catch {
                          // ignore
                        } finally {
                          setIsLoadingAiPriority(false)
                        }
                      }}
                    >
                      {isLoadingAiPriority ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      IA
                    </Button>
                  </div>
                  <div className="mt-3">
                    <Badge className={draftPriorityMeta.className}>{draftPriorityMeta.label}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Antes: {currentPriorityMeta.label}. Agora: {draftPriorityMeta.label}.
                  </p>
                  {aiPrioritySuggestion && (
                    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" /> Sugestão IA</p>
                      <p className="text-xs text-foreground">
                        Prioridade: <span className="font-bold">{aiPrioritySuggestion.suggested_priority}</span>
                        {" · "}Tipo: <span className="font-bold">{aiPrioritySuggestion.suggested_record_type}</span>
                      </p>
                      {aiPrioritySuggestion.reasoning && (
                        <p className="text-xs text-muted-foreground">{aiPrioritySuggestion.reasoning}</p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] rounded-lg mt-1"
                        onClick={() => {
                          if (aiPrioritySuggestion.suggested_priority) {
                            setDraftPriority(aiPrioritySuggestion.suggested_priority as Deal["priority"])
                          }
                          setAiPrioritySuggestion(null)
                        }}
                      >
                        Aplicar sugestão
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progresso</p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Badge className={draftProgressMeta.badgeClassName}>{draftProgressMeta.label}</Badge>
                      <span className="text-lg font-semibold">{safeDraftProgress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("h-full rounded-full transition-all", draftProgressMeta.barClassName)}
                        style={{ width: `${safeDraftProgress}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Ajuste o avanço do trabalho como em um board operacional estilo Monday.
                  </p>
                </div>

                <div className="rounded-2xl border bg-card p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Colaboradores</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {selectedUsers.slice(0, 4).map((user) => {
                        const displayName = getUserDisplayName(user)

                        return (
                          <Avatar key={user.id} className="h-10 w-10 border-2 border-background">
                            <AvatarFallback className="text-xs font-semibold">
                              {getUserInitials(displayName)}
                            </AvatarFallback>
                          </Avatar>
                        )
                      })}
                      {selectedUsers.length === 0 && (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground">
                          0
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{selectedUsers.length}</div>
                      <p className="text-sm text-muted-foreground">usuários relacionados</p>
                    </div>
                  </div>
                </div>
              </section>

              {latestManualUpdate ? (
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Último update manual</Badge>
                      {latestManualUpdate.actor_name ? (
                        <span className="text-xs text-muted-foreground">por {latestManualUpdate.actor_name}</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(latestManualUpdate.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{latestManualUpdate.description}</p>
                </section>
              ) : null}

              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Parâmetros de Governança</h3>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Coluna</p>
                    <Select value={draftColumnId} onValueChange={setDraftColumnId}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue placeholder="Selecione uma coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map((column) => (
                          <SelectItem
                            key={column.id}
                            value={column.id.toString()}
                            disabled={!getColumnTransitionGuard(currentDeal, column, deals, pipelines).allowed}
                          >
                            {column.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Catálogo de Serviços</p>
                    <Select value={draftServiceItemId} onValueChange={setDraftServiceItemId}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue placeholder="Selecione um serviço" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum serviço</SelectItem>
                        {items.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tipo ITIL v5</p>
                    <Select value={draftRecordType} onValueChange={(value) => setDraftRecordType(value as Deal["record_type"])}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incident">Incidente</SelectItem>
                        <SelectItem value="service_request">Requisição</SelectItem>
                        <SelectItem value="problem">Problema</SelectItem>
                        <SelectItem value="change">Mudança</SelectItem>
                        <SelectItem value="opportunity">Oportunidade</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="details" className="mt-0 space-y-6 p-4 sm:p-6">
               <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
                 <div className="space-y-6">
                    <section className="rounded-2xl border bg-card p-6 shadow-sm">
                      <div className="mb-6">
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">Descrição do Trabalho</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Relate o andamento, bloqueios e contexto operacional.</p>
                      </div>

                      <Textarea
                        value={draftDescription}
                        onChange={(event) => setDraftDescription(event.target.value)}
                        placeholder="Descreva o andamento aqui..."
                        className="min-h-[450px] resize-none rounded-2xl border-slate-200 bg-slate-50/30 p-6 text-sm leading-relaxed focus-visible:ring-primary/20"
                      />
                    </section>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border bg-background p-4">
                          <p className="text-sm font-medium">Responsável principal</p>
                          <div className="mt-3 flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="text-xs font-semibold">
                                {getUserInitials(ownerUser ? getUserDisplayName(ownerUser) : `Usuário ${currentDeal.owner}`)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold">
                                {ownerUser ? getUserDisplayName(ownerUser) : `Usuário #${currentDeal.owner}`}
                              </p>
                              <p className="text-xs text-muted-foreground">Responsável pelo card</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border bg-background p-4">
                          <p className="text-sm font-medium">Contato vinculado</p>
                          <div className="mt-3">
                            <p className="text-sm font-semibold">{currentDeal.contact_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Referência principal do atendimento ou oportunidade
                            </p>
                          </div>
                        </div>
                      </div>
                  </div>

                 <div className="space-y-6">
                    <section className="rounded-2xl border bg-card p-5 shadow-sm">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Stakeholders</h4>
                      <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                           <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                             <AvatarFallback className="text-xs font-black bg-primary/10 text-primary">
                               {getUserInitials(ownerUser ? getUserDisplayName(ownerUser) : "U")}
                             </AvatarFallback>
                           </Avatar>
                           <div className="flex-1 min-w-0">
                             <p className="text-xs font-black truncate">{ownerUser ? getUserDisplayName(ownerUser) : "Sem Dono"}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Responsável</p>
                           </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                           <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center border-2 border-white shadow-sm">
                              <User className="h-5 w-5 text-slate-400" />
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-xs font-black truncate">{currentDeal.contact_name || "Nenhum"}</p>
                             <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Solicitante</p>
                           </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-2xl border bg-card p-5 shadow-sm">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Equipe Relacionada</h4>
                      <div className="flex -space-x-3 overflow-hidden p-1">
                        {selectedUsers.map((user) => (
                          <Avatar key={user.id} className="h-10 w-10 border-4 border-card ring-1 ring-slate-100 shadow-sm">
                            <AvatarFallback className="text-[10px] font-black">{getUserInitials(getUserDisplayName(user))}</AvatarFallback>
                          </Avatar>
                        ))}
                        {selectedUsers.length === 0 && <p className="text-xs text-muted-foreground italic">Ninguém vinculado</p>}
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Gestão de Equipe</p>
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input
                            value={userSearch}
                            onChange={(event) => setUserSearch(event.target.value)}
                            placeholder="Buscar especialistas..."
                            className="pl-9 h-9 text-xs rounded-xl border-slate-100 bg-slate-50/50"
                          />
                        </div>

                        <ScrollArea className="h-48">
                          <div className="space-y-2">
                            {filteredUsers.map((user) => {
                              const checked = draftRelatedUsers.includes(user.id)
                              return (
                                <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                                   <Checkbox 
                                     checked={checked} 
                                     onCheckedChange={(val) => handleToggleRelatedUser(user.id, val === true)}
                                     className="rounded-md border-slate-200"
                                   />
                                   <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-bold truncate">{getUserDisplayName(user)}</p>
                                   </div>
                                </div>
                              )
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    </section>
                 </div>
               </div>
            </TabsContent>

            <TabsContent value="images" className="mt-0 space-y-6 p-4 sm:p-6">
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Imagens</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tire uma foto na hora (câmera) ou selecione um arquivo já enviado na biblioteca.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{attachments.length}</Badge>
                    {totalQueuedAttachments > 0 ? <Badge variant="secondary">Pendentes: {totalQueuedAttachments}</Badge> : null}
                  </div>
                </div>

                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null
                    void handleCapturePhoto(file)
                  }}
                />

                <div className="grid gap-2 sm:grid-cols-[170px_1fr_auto_auto]">
                  <Select value={draftAttachmentPhase} onValueChange={(value) => setDraftAttachmentPhase(value as "before" | "during" | "after")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Fase" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before">Antes</SelectItem>
                      <SelectItem value="during">Durante</SelectItem>
                      <SelectItem value="after">Depois</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    value={draftAttachmentCaption}
                    onChange={(event) => setDraftAttachmentCaption(event.target.value)}
                    maxLength={255}
                    placeholder="Legenda (opcional)"
                    className="w-full"
                  />

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={!canAttachFiles || addDealAttachment.isPending}
                    className="w-full sm:w-auto"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Câmera
                  </Button>

                  <MediaDialog
                    onSelect={() => {}}
                    onSelectItem={(item) => {
                      const url = fixImageUrl(item.file_url)
                      const previewId =
                        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tmp-${Date.now()}-${Math.random()}`
                      const caption = draftAttachmentCaption.trim()
                      const phase = draftAttachmentPhase
                      setPendingAttachmentPreviews((prev) => [{ id: previewId, url, title: item.title, phase, caption }, ...prev])
                      void addDealAttachment
                        .mutateAsync({
                          dealId: currentDeal.id,
                          mediaId: item.id,
                          kind: item.file_type.startsWith("image/") ? "photo" : "file",
                          phase,
                          caption,
                        })
                        .catch(async (err) => {
                          if (!isCRMNetworkError(err)) return
                          const queued = await enqueueOfflineDealAttachmentUpload({
                            dealId: currentDeal.id,
                            source: "media",
                            mediaId: item.id,
                            previewUrl: url,
                            title: item.title,
                            fileType: item.file_type,
                            kind: item.file_type.startsWith("image/") ? "photo" : "file",
                            phase,
                            caption,
                          })
                          setQueuedAttachmentPreviews((prev) => [{ id: queued.id, url, title: item.title, phase, caption, isObjectUrl: false }, ...prev])
                          toast.success("Sem conexão: anexo salvo localmente e será enviado quando voltar a internet.")
                        })
                        .finally(() => {
                          setPendingAttachmentPreviews((prev) => prev.filter((p) => p.id !== previewId))
                        })
                    }}
                    trigger={
                      <Button type="button" variant="outline" disabled={!canAttachFiles || addDealAttachment.isPending} className="w-full sm:w-auto">
                        Biblioteca
                      </Button>
                    }
                  />
                </div>
                {!canAttachFiles ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Você não tem permissão para anexar imagens/arquivos neste card.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={imagesFilter === "all" ? "default" : "outline"}
                      onClick={() => setImagesFilter("all")}
                    >
                      Tudo
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={imagesFilter === "before" ? "default" : "outline"}
                      onClick={() => setImagesFilter("before")}
                    >
                      Antes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={imagesFilter === "during" ? "default" : "outline"}
                      onClick={() => setImagesFilter("during")}
                    >
                      Durante
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={imagesFilter === "after" ? "default" : "outline"}
                      onClick={() => setImagesFilter("after")}
                    >
                      Depois
                    </Button>
                  </div>
                  {queuedAttachmentPreviews.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void handleFlushQueuedAttachments()}
                      disabled={typeof navigator !== "undefined" && navigator.onLine === false}
                    >
                      Enviar pendentes ({queuedAttachmentPreviews.length})
                    </Button>
                  ) : null}
                </div>

                {addDealAttachment.isPending && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Enviando anexo...
                  </div>
                )}

                {filteredQueuedAttachmentPreviews.length > 0 || filteredPendingAttachmentPreviews.length > 0 || filteredAttachments.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {filteredQueuedAttachmentPreviews.slice(0, 6).map((preview) => (
                      <div key={preview.id} className="group relative overflow-hidden rounded-xl border bg-background">
                        <div className="block aspect-square">
                          <div className="relative h-full w-full">
                            <Image src={preview.url} alt={preview.title || "Anexo"} fill className="object-cover opacity-60" sizes="160px" unoptimized loading="lazy" />
                          </div>
                        </div>
                        <div className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs">
                          {preview.phase === "before" ? "Antes" : preview.phase === "after" ? "Depois" : "Durante"}
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => void handleRemoveQueuedAttachment(preview.id)}
                          aria-label="Remover foto pendente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-2">
                          <div className="text-xs text-muted-foreground">Pendente (offline)</div>
                          {preview.caption ? <div className="mt-1 text-xs text-foreground">{preview.caption}</div> : null}
                        </div>
                      </div>
                    ))}

                    {filteredPendingAttachmentPreviews.slice(0, 6).map((preview) => (
                      <div key={preview.id} className="relative overflow-hidden rounded-xl border bg-background">
                        <div className="block aspect-square">
                          <div className="relative h-full w-full">
                            <Image src={preview.url} alt={preview.title || "Anexo"} fill className="object-cover opacity-60" sizes="160px" unoptimized loading="lazy" />
                          </div>
                        </div>
                        <div className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs">
                          {preview.phase === "before" ? "Antes" : preview.phase === "after" ? "Depois" : "Durante"}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-2">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                            Enviando...
                          </div>
                          {preview.caption ? <div className="mt-1 text-xs text-foreground">{preview.caption}</div> : null}
                        </div>
                      </div>
                    ))}

                    {filteredAttachments.map((attachment) => {
                      const isImage = attachment.media_file_type?.startsWith("image/")
                      const url = fixImageUrl(attachment.media_file_url)
                      if (!url) return null

                      return (
                        <div key={attachment.id} className="group relative overflow-hidden rounded-xl border bg-background">
                          <a href={url} target="_blank" rel="noreferrer" className="block aspect-square">
                            {isImage ? (
                              <div className="relative h-full w-full">
                                <Image
                                  src={url}
                                  alt={attachment.caption || attachment.media_title || "Anexo"}
                                  fill
                                  className="object-cover"
                                  sizes="160px"
                                  unoptimized
                                  loading="lazy"
                                />
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
                                {attachment.media_title || "Arquivo"}
                              </div>
                            )}
                          </a>

                          <div className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-xs">
                            {attachment.phase === "before" ? "Antes" : attachment.phase === "after" ? "Depois" : "Durante"}
                          </div>

                          {attachment.caption ? (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-2">
                              <div className="text-xs text-foreground">{attachment.caption}</div>
                            </div>
                          ) : null}

                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={() => {
                              if (!canDeleteAttachments) return
                              void deleteDealAttachment.mutateAsync({ dealId: currentDeal.id, attachmentId: attachment.id })
                            }}
                            disabled={!canDeleteAttachments || deleteDealAttachment.isPending}
                            aria-label="Remover anexo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                    Nenhuma imagem anexada ainda.
                  </div>
                )}
              </section>
            </TabsContent>

            <TabsContent value="cis" className="mt-0 space-y-6 p-4 sm:p-6">
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Itens de Configuração (CMDB)</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Escolha os ativos ou serviços de TI impactados por este card para manter a rastreabilidade ITIL version 5.</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-sm font-medium">Buscar ICs</p>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Buscar por nome, tag ou número de série"
                        className="pl-9"
                      />
                    </div>

                    <ScrollArea className="mt-4 h-96 rounded-2xl border">
                      <div className="space-y-2 p-3">
                        {cis.filter((ci: any) => 
                          ci.name.toLowerCase().includes(userSearch.toLowerCase()) || 
                          (ci.asset_tag || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                          (ci.serial_number || "").toLowerCase().includes(userSearch.toLowerCase())
                        ).length > 0 ? (
                          cis.filter((ci: any) => 
                            ci.name.toLowerCase().includes(userSearch.toLowerCase()) || 
                            (ci.asset_tag || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                            (ci.serial_number || "").toLowerCase().includes(userSearch.toLowerCase())
                          ).map((ci: any) => {
                            const checked = draftAffectedCis.includes(ci.id)
                            return (
                              <label
                                key={ci.id}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary/30 bg-primary/5" : "bg-background/70 hover:bg-muted/40"}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    setDraftAffectedCis(prev => 
                                      value ? [...prev, ci.id] : prev.filter(id => id !== ci.id)
                                    )
                                  }}
                                />
                                <div className="space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium">{ci.name}</p>
                                    <Badge variant="outline" className="text-[10px]">{ci.ci_type_name}</Badge>
                                    {ci.status === 'broken' && <Badge variant="destructive" className="text-[10px]">Falha</Badge>}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {ci.asset_tag ? `Tag: ${ci.asset_tag}` : ""} {ci.serial_number ? ` | SN: ${ci.serial_number}` : ""}
                                    {ci.location ? ` | Local: ${ci.location}` : ""}
                                  </p>
                                </div>
                              </label>
                            )
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
                            Nenhum Item de Configuração encontrado.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {draftAffectedCis.length > 0 && (
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">Selecionados</p>
                      <div className="flex flex-wrap gap-2">
                        {draftAffectedCis.map(id => {
                          const ci = cis.find((c: any) => c.id === id)
                          if (!ci) return null
                          return (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1">
                              {ci.name}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4 rounded-full p-0 hover:bg-muted" 
                                onClick={() => setDraftAffectedCis(prev => prev.filter(i => i !== id))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="governance" className="mt-0 space-y-6 p-4 sm:p-6">
              {draftRecordType === 'change' && (
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Governança de Mudança</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Documentação obrigatória para requisições de mudança (RFC) conforme ITIL version 5.
                      </p>
                    </div>
                    <Badge variant={draftRiskLevel === 'critical' || draftRiskLevel === 'high' ? 'destructive' : 'outline'}>
                      Risco: {draftRiskLevel === 'none' || !draftRiskLevel ? 'Não definido' : draftRiskLevel.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Nível de Risco</p>
                      <Select value={draftRiskLevel || "none"} onValueChange={(v) => setDraftRiskLevel(v as any)}>
                        <SelectTrigger className="mt-3">
                          <SelectValue placeholder="Selecione o risco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione o risco</SelectItem>
                          <SelectItem value="low">Baixo (Standard Change)</SelectItem>
                          <SelectItem value="medium">Médio (Normal Change)</SelectItem>
                          <SelectItem value="high">Alto (High Impact)</SelectItem>
                          <SelectItem value="critical">Crítico (Emergency/Critical)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Justificativa da Mudança</p>
                        <Textarea 
                          value={draftChangeJustification}
                          onChange={(e) => setDraftChangeJustification(e.target.value)}
                          placeholder="Por que esta mudança é necessária?"
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Plano de Implementação</p>
                        <Textarea 
                          value={draftImplementationPlan}
                          onChange={(e) => setDraftImplementationPlan(e.target.value)}
                          placeholder="Passo a passo da execução..."
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Plano de Recuo (Backout)</p>
                        <Textarea 
                          value={draftBackoutPlan}
                          onChange={(e) => setDraftBackoutPlan(e.target.value)}
                          placeholder="Como reverter em caso de falha?"
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Plano de Testes</p>
                        <Textarea 
                          value={draftTestPlan}
                          onChange={(e) => setDraftTestPlan(e.target.value)}
                          placeholder="Como validar o sucesso?"
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {draftRecordType === 'problem' && (
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Investigação de Problema</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Análise de Causa Raiz (RCA) e definição de Error Conhecido.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                      <span className="text-xs font-semibold text-muted-foreground mr-2">PUBLICAR NO KEDB</span>
                      <Switch 
                        checked={draftIsKnownError} 
                        onCheckedChange={setDraftIsKnownError} 
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Análise de Causa Raiz (RCA)</p>
                      <p className="mt-1 text-xs text-muted-foreground mb-3">Identifique o motivo fundamental da falha encontrada.</p>
                      <Textarea 
                        value={draftRootCause}
                        onChange={(e) => setDraftRootCause(e.target.value)}
                        placeholder="Ex: Falha no disco rígido por desgaste físico após 5 anos..."
                        className="mt-3 min-h-[160px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Solução Definitiva / Workaround</p>
                      <p className="mt-1 text-xs text-muted-foreground mb-3">Estes passos serão visíveis para o Service Desk como erro conhecido.</p>
                      <Textarea 
                        value={draftResolutionSteps}
                        onChange={(e) => setDraftResolutionSteps(e.target.value)}
                        placeholder="Passos para resolver ou contornar..."
                        className="mt-3 min-h-[160px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="xla" className="mt-0 space-y-6 p-4 sm:p-6">
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Experiência do Usuário (XLA)</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Acordos de Nível de Experiência medem a satisfação subjetiva e a percepção de valor do produto digital.
                    </p>
                  </div>
                  {currentDeal.xla_score && (
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-bold text-primary">{currentDeal.xla_score}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">Score Médio</span>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {currentDeal.is_closed && (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm font-semibold">Como foi sua experiência com este item?</p>
                      <div className="mt-4 flex flex-wrap gap-4">
                         <div className="space-y-2">
                            <p className="text-xs text-muted-foreground uppercase">Geral</p>
                            <div className="flex gap-1">
                               {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                 <button 
                                   key={n} 
                                   onClick={() => submitXla.mutate({ rating: n, deal: currentDeal.id, contact: currentDeal.contact ?? undefined })}
                                   className="h-8 w-8 rounded-lg border bg-background hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-medium"
                                 >
                                   {n}
                                 </button>
                               ))}
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Histórico de Feedback</p>
                    {xlaFeedbacks.length > 0 ? (
                      xlaFeedbacks.map((f: any) => (
                        <div key={f.id} className="rounded-2xl border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                               <Badge variant="secondary">{f.rating}/10</Badge>
                               <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</span>
                             </div>
                          </div>
                          {f.comment && <p className="text-sm italic text-muted-foreground">"{f.comment}"</p>}
                          <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground uppercase">
                             <div>Uso: {f.ease_of_use}/10</div>
                             <div>Velocidade: {f.speed_satisfaction}/10</div>
                             <div>Resultado: {f.outcome_satisfaction}/10</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Nenhum feedback XLA registrado ainda.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="topology" className="mt-0 p-4 sm:p-6">
              <section className="rounded-3xl border bg-slate-950 p-8 shadow-2xl relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                
                <div className="relative z-10 w-full max-w-4xl space-y-8">
                   <div className="text-center space-y-2">
                     <h3 className="text-xl font-black text-white tracking-widest uppercase">Análise de Impacto 360°</h3>
                     <p className="text-blue-400/70 text-xs font-semibold tracking-tight uppercase">CMDB Topology Analytics Engine</p>
                   </div>

                   {isLoadingTopology ? (
                     <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-white/50 text-xs animate-pulse">Rastreando dependências em cascata...</p>
                     </div>
                   ) : (
                     <div className="relative border border-white/10 rounded-3xl bg-black/40 backdrop-blur-xl p-10 min-h-[400px]">
                        {(Array.isArray(topologyData?.nodes) ? topologyData.nodes : []).length > 0 ? (
                          <div className="flex flex-col items-center gap-12">
                             {(Array.isArray(topologyData?.nodes) ? topologyData.nodes : []).filter(n => n.type === 'deal').map(node => (
                               <motion.div 
                                 key={node.id}
                                 initial={{ scale: 0.8, opacity: 0 }}
                                 animate={{ scale: 1, opacity: 1 }}
                                 className="relative"
                               >
                                 <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.5)] border-2 border-primary-foreground/20">
                                   <Zap className="h-10 w-10 text-white fill-current" />
                                 </div>
                                 <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 text-white font-black text-sm whitespace-nowrap bg-primary px-3 py-1 rounded-full uppercase tracking-tighter">
                                   ITEM CENTRAL: {node.label}
                                 </div>
                               </motion.div>
                             ))}

                             <div className="flex flex-wrap justify-center gap-8 w-full mt-12 px-4">
                                {(Array.isArray(topologyData?.nodes) ? topologyData.nodes : []).filter(n => n.type === 'ci').map(node => (
                                  <motion.div 
                                    key={node.id}
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="flex flex-col items-center space-y-4"
                                  >
                                    <div className="h-[2px] w-12 bg-gradient-to-t from-primary to-transparent" />
                                    <div className={cn(
                                       "h-16 w-16 rounded-xl border-2 flex items-center justify-center transition-all",
                                       node.status === 'broken' ? "bg-rose-500/20 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]" : "bg-blue-500/10 border-blue-500/50"
                                    )}>
                                       <Box className={cn("h-8 w-8", node.status === 'broken' ? "text-rose-500" : "text-blue-400")} />
                                    </div>
                                    <div className="text-center">
                                       <p className="text-[10px] font-black text-white/90 uppercase tracking-tighter">{node.label}</p>
                                       <Badge variant="outline" className="text-[8px] h-4 mt-1 border-white/10 text-white/50">{node.kind}</Badge>
                                    </div>
                                  </motion.div>
                                ))}
                             </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                             <div className="h-16 w-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center opacity-30">
                                <Search className="h-8 w-8 text-white" />
                             </div>
                             <p className="text-white/40 text-sm max-w-[250px]">Nenhum IC (Item de Configuração) vinculado a este card para análise de topologia.</p>
                          </div>
                        )}
                     </div>
                   )}

                   <div className="flex justify-center gap-10">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-primary" />
                        <span className="text-[10px] font-bold text-white/50 uppercase">Ponto de Falha</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-rose-500" />
                        <span className="text-[10px] font-bold text-white/50 uppercase">Impacto Crítico</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-blue-500/30 border border-blue-500/50" />
                        <span className="text-[10px] font-bold text-white/50 uppercase">Dependência Ativa</span>
                      </div>
                   </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="history" className="mt-0 space-y-6 p-4 sm:p-6">
              <div className="mx-auto w-full max-w-4xl space-y-6">
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Publicar atualização</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Registre um update rápido no histórico do card com contexto, bloqueios ou próximos passos sem alterar a descrição principal.
                      </p>
                    </div>
                    <Badge variant="outline">Histórico colaborativo</Badge>
                  </div>

                  <div className="rounded-2xl border bg-background p-4">
                    <div className="relative">
                      <Textarea
                        ref={updateTextareaRef}
                        value={draftUpdateNote}
                        onChange={(event) => {
                          const next = event.target.value
                          setDraftUpdateNote(next)
                          updateMentionState(next, event.target.selectionStart)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && mentionOpen) {
                            event.preventDefault()
                            setMentionOpen(false)
                            setMentionQuery("")
                            return
                          }

                          if (mentionOpen && mentionSuggestions.length > 0) {
                            if (event.key === "ArrowDown") {
                              event.preventDefault()
                              setMentionIndex((current) => Math.min(current + 1, mentionSuggestions.length - 1))
                              return
                            }
                            if (event.key === "ArrowUp") {
                              event.preventDefault()
                              setMentionIndex((current) => Math.max(current - 1, 0))
                              return
                            }
                            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                              event.preventDefault()
                              const target = mentionSuggestions[mentionIndex]
                              if (target) insertMention(target.username)
                              return
                            }
                            if (event.key === "Tab") {
                              setMentionOpen(false)
                              setMentionQuery("")
                            }
                          }

                          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                            event.preventDefault()
                            if (draftUpdateNote.trim() && !addDealNote.isPending) {
                              void handlePublishUpdate()
                            }
                          }
                        }}
                        onClick={(event) => updateMentionState((event.target as HTMLTextAreaElement).value, (event.target as HTMLTextAreaElement).selectionStart)}
                        onKeyUp={(event) => updateMentionState((event.target as HTMLTextAreaElement).value, (event.target as HTMLTextAreaElement).selectionStart)}
                        maxLength={5000}
                        placeholder="Ex.: Cliente respondeu, agenda confirmada para amanhã e aguardamos a liberação do acesso remoto. Use @usuario para mencionar."
                        className="min-h-[140px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      />

                      {mentionOpen && mentionSuggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border bg-background shadow-sm">
                          <div className="max-h-56 overflow-y-auto p-2">
                            {mentionSuggestions.map((u) => (
                              <button
                                key={u.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted",
                                  mentionSuggestions[mentionIndex]?.id === u.id ? "bg-muted" : ""
                                )}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => insertMention(u.username)}
                              >
                                <span className="truncate font-medium">{getUserDisplayName(u)}</span>
                                <span className="truncate text-xs text-muted-foreground">@{u.username}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-muted-foreground">
                        A atualização entra no histórico do card como anotação manual. Ctrl+Enter publica.
                      </p>
                      <Button
                        onClick={handlePublishUpdate}
                        disabled={!canPublishUpdate || !draftUpdateNote.trim() || addDealNote.isPending}
                        className="w-full sm:w-auto"
                      >
                        {addDealNote.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Publicar update
                      </Button>
                    </div>
                    {!canPublishUpdate ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Você não tem permissão para publicar updates neste card.
                      </p>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Histórico</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Filtre rapidamente os eventos do card para acompanhar updates manuais, movimentações e automações.
                      </p>
                    </div>
                    <Badge variant="outline">
                      {filteredActivities.length} de {activities.length}
                    </Badge>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {ACTIVITY_FILTER_OPTIONS.map((option) => (
                      <Button
                        key={option.id}
                        type="button"
                        variant={activityFilter === option.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActivityFilter(option.id)}
                      >
                        {option.label} ({activityFilterCounts[option.id]})
                      </Button>
                    ))}
                  </div>

                  <p className="mb-4 text-xs text-muted-foreground">
                    Exibindo {filteredActivities.length} registro{filteredActivities.length === 1 ? "" : "s"} para o filtro selecionado.
                  </p>

                  <div className="space-y-4">
                    {filteredActivities.length > 0 ? (
                      filteredActivities.map((activity) => (
                        <div key={activity.id} className="rounded-2xl border bg-background/80 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{getActivityTypeLabel(activity.activity_type)}</Badge>
                                {latestManualUpdate?.id === activity.id && activity.activity_type === "note" && (
                                  <Badge variant="secondary">Update mais recente</Badge>
                                )}
                                {activity.actor_name && (
                                  <span className="text-xs text-muted-foreground">por {activity.actor_name}</span>
                                )}
                                {activity.activity_type === "ai_action" && (
                                  <Badge className="bg-purple-100 text-purple-700 border-purple-200">AI AGENT</Badge>
                                )}
                              </div>
                              <p className="text-sm text-foreground">{activity.description}</p>
                            </div>
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                        Nenhuma atividade encontrada para o filtro atual.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </TabsContent>

            <TabsContent value="cis" className="mt-0 space-y-6 p-4 sm:p-6">
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Itens de Configuração (CMDB)</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Escolha os ativos ou serviços de TI impactados por este card para manter a rastreabilidade ITIL version 5.</p>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border bg-background p-4">
                    <p className="text-sm font-medium">Buscar ICs</p>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={userSearch} // Reusing search state for simplicity or could new one
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Buscar por nome, tag ou número de série"
                        className="pl-9"
                      />
                    </div>

                    <ScrollArea className="mt-4 h-96 rounded-2xl border">
                      <div className="space-y-2 p-3">
                        {cis.filter((ci: any) => 
                          ci.name.toLowerCase().includes(userSearch.toLowerCase()) || 
                          (ci.asset_tag || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                          (ci.serial_number || "").toLowerCase().includes(userSearch.toLowerCase())
                        ).length > 0 ? (
                          cis.filter((ci: any) => 
                            ci.name.toLowerCase().includes(userSearch.toLowerCase()) || 
                            (ci.asset_tag || "").toLowerCase().includes(userSearch.toLowerCase()) ||
                            (ci.serial_number || "").toLowerCase().includes(userSearch.toLowerCase())
                          ).map((ci: any) => {
                            const checked = draftAffectedCis.includes(ci.id)
                            return (
                              <label
                                key={ci.id}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary/30 bg-primary/5" : "bg-background/70 hover:bg-muted/40"}`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(value) => {
                                    setDraftAffectedCis(prev => 
                                      value ? [...prev, ci.id] : prev.filter(id => id !== ci.id)
                                    )
                                  }}
                                />
                                <div className="space-y-1 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-medium">{ci.name}</p>
                                    <Badge variant="outline" className="text-[10px]">{ci.ci_type_name}</Badge>
                                    {ci.status === 'broken' && <Badge variant="destructive" className="text-[10px]">Falha</Badge>}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {ci.asset_tag ? `Tag: ${ci.asset_tag}` : ""} {ci.serial_number ? ` | SN: ${ci.serial_number}` : ""}
                                    {ci.location ? ` | Local: ${ci.location}` : ""}
                                  </p>
                                </div>
                              </label>
                            )
                          })
                        ) : (
                          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground text-center">
                            Nenhum Item de Configuração encontrado.
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {draftAffectedCis.length > 0 && (
                    <div className="rounded-2xl border bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">Selecionados</p>
                      <div className="flex flex-wrap gap-2">
                        {draftAffectedCis.map(id => {
                          const ci = cis.find((c: any) => c.id === id)
                          if (!ci) return null
                          return (
                            <Badge key={id} variant="secondary" className="gap-1 pr-1">
                              {ci.name}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-4 w-4 rounded-full p-0 hover:bg-muted" 
                                onClick={() => setDraftAffectedCis(prev => prev.filter(i => i !== id))}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </TabsContent>
            <TabsContent value="governance" className="mt-0 space-y-6 p-4 sm:p-6">
              {draftRecordType === 'change' && (
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  {/* ... Existing Change UI (I'll need to wrap it or keep it) ... */}
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Governança de Mudança</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Documentação obrigatória para requisições de mudança (RFC) conforme ITIL version 5.
                      </p>
                    </div>
                    <Badge variant={draftRiskLevel === 'critical' || draftRiskLevel === 'high' ? 'destructive' : 'outline'}>
                      Risco: {draftRiskLevel === 'none' || !draftRiskLevel ? 'Não definido' : draftRiskLevel.toUpperCase()}
                    </Badge>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Nível de Risco</p>
                      <Select value={draftRiskLevel || "none"} onValueChange={(v) => setDraftRiskLevel(v as any)}>
                        <SelectTrigger className="mt-3">
                          <SelectValue placeholder="Selecione o risco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione o risco</SelectItem>
                          <SelectItem value="low">Baixo (Standard Change)</SelectItem>
                          <SelectItem value="medium">Médio (Normal Change)</SelectItem>
                          <SelectItem value="high">Alto (High Impact)</SelectItem>
                          <SelectItem value="critical">Crítico (Emergency/Critical)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Justificativa da Mudança</p>
                        <Textarea 
                          value={draftChangeJustification}
                          onChange={(e) => setDraftChangeJustification(e.target.value)}
                          placeholder="Por que esta mudança é necessária?"
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Plano de Implementação</p>
                        <Textarea 
                          value={draftImplementationPlan}
                          onChange={(e) => setDraftImplementationPlan(e.target.value)}
                          placeholder="Passo a passo da execução..."
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Plano de Recuo (Backout)</p>
                        <Textarea 
                          value={draftBackoutPlan}
                          onChange={(e) => setDraftBackoutPlan(e.target.value)}
                          placeholder="Como reverter em caso de falha?"
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Plano de Testes</p>
                        <Textarea 
                          value={draftTestPlan}
                          onChange={(e) => setDraftTestPlan(e.target.value)}
                          placeholder="Como validar o sucesso?"
                          className="mt-3 min-h-[120px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {draftRecordType === 'problem' && (
                <section className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Investigação de Problema</h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Análise de Causa Raiz (RCA) e definição de Error Conhecido.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1">
                      <span className="text-xs font-semibold text-muted-foreground mr-2">PUBLICAR NO KEDB</span>
                      <Switch 
                        checked={draftIsKnownError} 
                        onCheckedChange={setDraftIsKnownError} 
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Análise de Causa Raiz (RCA)</p>
                      <p className="mt-1 text-xs text-muted-foreground mb-3">Identifique o motivo fundamental da falha encontrada.</p>
                      <Textarea 
                        value={draftRootCause}
                        onChange={(e) => setDraftRootCause(e.target.value)}
                        placeholder="Ex: Falha no disco rígido por desgaste físico após 5 anos..."
                        className="mt-3 min-h-[160px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      />
                    </div>

                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Solução Definitiva / Workaround</p>
                      <p className="mt-1 text-xs text-muted-foreground mb-3">Estes passos serão visíveis para o Service Desk como erro conhecido.</p>
                      <Textarea 
                        value={draftResolutionSteps}
                        onChange={(e) => setDraftResolutionSteps(e.target.value)}
                        placeholder="Passos para resolver ou contornar..."
                        className="mt-3 min-h-[160px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="xla" className="mt-0 space-y-6 p-4 sm:p-6">
              <section className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Experiência do Usuário (XLA)</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Acordos de Nível de Experiência medem a satisfação subjetiva e a percepção de valor do produto digital.
                    </p>
                  </div>
                  {currentDeal.xla_score && (
                    <div className="flex flex-col items-end">
                      <span className="text-2xl font-bold text-primary">{currentDeal.xla_score}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">Score Médio</span>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Form for new XLA if closed (simplified) */}
                  {currentDeal.is_closed && (
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <p className="text-sm font-semibold">Como foi sua experiência com este item?</p>
                      <div className="mt-4 flex flex-wrap gap-4">
                         <div className="space-y-2">
                            <p className="text-xs text-muted-foreground uppercase">Geral</p>
                            <div className="flex gap-1">
                               {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                 <button 
                                   key={n} 
                                   onClick={() => submitXla.mutate({ rating: n, deal: currentDeal.id, contact: currentDeal.contact ?? undefined })}
                                   className="h-8 w-8 rounded-lg border bg-background hover:bg-primary hover:text-primary-foreground transition-colors text-xs font-medium"
                                 >
                                   {n}
                                 </button>
                               ))}
                            </div>
                         </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Histórico de Feedback</p>
                    {xlaFeedbacks.length > 0 ? (
                      xlaFeedbacks.map((f: any) => (
                        <div key={f.id} className="rounded-2xl border p-4 space-y-3">
                          <div className="flex items-center justify-between">
                             <div className="flex items-center gap-2">
                               <Badge variant="secondary">{f.rating}/10</Badge>
                               <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</span>
                             </div>
                          </div>
                          {f.comment && <p className="text-sm italic text-muted-foreground">"{f.comment}"</p>}
                          <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground uppercase">
                             <div>Uso: {f.ease_of_use}/10</div>
                             <div>Velocidade: {f.speed_satisfaction}/10</div>
                             <div>Resultado: {f.outcome_satisfaction}/10</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                        Nenhum feedback XLA registrado ainda.
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="topology" className="mt-0 p-4 sm:p-6">
              <section className="rounded-3xl border bg-slate-950 p-8 shadow-2xl relative overflow-hidden min-h-[500px] flex flex-col items-center justify-center">
                {/* Background Grid for Tech look */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
                
                <div className="relative z-10 w-full max-w-4xl space-y-8">
                   <div className="text-center space-y-2">
                     <h3 className="text-xl font-black text-white tracking-widest uppercase">Análise de Impacto 360°</h3>
                     <p className="text-blue-400/70 text-xs font-semibold tracking-tight uppercase">CMDB Topology Analytics Engine</p>
                   </div>

                   {isLoadingTopology ? (
                     <div className="flex flex-col items-center justify-center py-20 space-y-4">
                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        <p className="text-white/50 text-xs animate-pulse">Rastreando dependências em cascata...</p>
                     </div>
                   ) : (
                     <div className="relative border border-white/10 rounded-3xl bg-black/40 backdrop-blur-xl p-10 min-h-[400px]">
                        {(Array.isArray(topologyData?.nodes) ? topologyData.nodes : []).length > 0 ? (
                          <div className="flex flex-col items-center gap-12">
                             {/* Central Node: The Deal */}
                             {(Array.isArray(topologyData?.nodes) ? topologyData.nodes : []).filter(n => n.type === 'deal').map(node => (
                               <motion.div 
                                 key={node.id}
                                 initial={{ scale: 0.8, opacity: 0 }}
                                 animate={{ scale: 1, opacity: 1 }}
                                 className="relative"
                               >
                                 <div className="h-20 w-20 rounded-2xl bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.5)] border-2 border-primary-foreground/20">
                                   <Zap className="h-10 w-10 text-white fill-current" />
                                 </div>
                                 <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 text-white font-black text-sm whitespace-nowrap bg-primary px-3 py-1 rounded-full uppercase tracking-tighter">
                                   ITEM CENTRAL: {node.label}
                                 </div>
                               </motion.div>
                             ))}

                             {/* Branches: Directly Affected CIs */}
                             <div className="flex flex-wrap justify-center gap-8 w-full mt-12 px-4">
                                {(Array.isArray(topologyData?.nodes) ? topologyData.nodes : []).filter(n => n.type === 'ci').map(node => (
                                  <motion.div 
                                    key={node.id}
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="flex flex-col items-center space-y-4"
                                  >
                                    <div className="h-[2px] w-12 bg-gradient-to-t from-primary to-transparent" />
                                    <div className={cn(
                                       "h-16 w-16 rounded-xl border-2 flex items-center justify-center transition-all",
                                       node.status === 'broken' ? "bg-rose-500/20 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]" : "bg-blue-500/10 border-blue-500/50"
                                    )}>
                                       <Box className={cn("h-8 w-8", node.status === 'broken' ? "text-rose-500" : "text-blue-400")} />
                                    </div>
                                    <div className="text-center">
                                       <p className="text-[10px] font-black text-white/90 uppercase tracking-tighter">{node.label}</p>
                                       <Badge variant="outline" className="text-[8px] h-4 mt-1 border-white/10 text-white/50">{node.kind}</Badge>
                                    </div>
                                  </motion.div>
                                ))}
                             </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                             <div className="h-16 w-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center opacity-30">
                                <Search className="h-8 w-8 text-white" />
                             </div>
                             <p className="text-white/40 text-sm max-w-[250px]">Nenhum IC (Item de Configuração) vinculado a este card para análise de topologia.</p>
                          </div>
                        )}
                     </div>
                   )}

                   <div className="flex justify-center gap-10">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-primary" />
                        <span className="text-[10px] font-bold text-white/50 uppercase">Ponto de Falha</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-rose-500" />
                        <span className="text-[10px] font-bold text-white/50 uppercase">Impacto Crítico</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-blue-500/30 border border-blue-500/50" />
                        <span className="text-[10px] font-bold text-white/50 uppercase">Dependência Ativa</span>
                      </div>
                   </div>
                </div>
              </section>
            </TabsContent>
            </Tabs>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function KnowledgeBaseTab({ dealId }: { dealId: number }) {
  const { data, isLoading } = useKBSuggestions(dealId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded-full bg-white/10 animate-pulse" />
                <div className="h-3 w-full rounded-full bg-white/5 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!data || data.suggestions.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-20 text-center"
      >
        <div className="h-20 w-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
          <BookOpen className="h-10 w-10 text-white/20" />
        </div>
        <h3 className="text-lg font-bold text-white/40">Base Vazia</h3>
        <p className="mt-2 text-sm text-white/20 max-w-[280px]">Não encontramos artigos técnicos relacionados ao contexto deste card.</p>
      </motion.div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Artigos Recomendados</h4>
        <Badge variant="outline" className="text-[9px] border-white/10 text-white/40">{data.suggestions.length} ARTIGOS</Badge>
      </div>
      <div className="grid gap-4">
        {data.suggestions.map((article, idx) => (
          <motion.div
            key={article.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Link
              href={`/articles/${article.slug}`}
              target="_blank"
              className="group block relative overflow-hidden rounded-2xl border border-white/5 bg-white/5 p-5 transition-all hover:border-primary/40 hover:bg-white/10 hover:shadow-2xl hover:shadow-primary/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{article.title}</span>
                    <ExternalLink className="h-3 w-3 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-white/40 line-clamp-2">{article.excerpt}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/30 group-hover:bg-primary/20 group-hover:text-primary transition-all">
                  <BookOpen className="h-5 w-5" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function AIAssistantTab({ dealId }: { dealId: number }) {
  const { data, isLoading } = useKBSuggestions(dealId)
  const [typedSummary, setTypedSummary] = useState("")
  const [isTyping, setIsTyping] = useState(false)

  // Efeito de Digitação "Premium" para a IA
  useEffect(() => {
    if (data?.ai_summary && !isLoading) {
      setIsTyping(true)
      let i = 0
      const fullText = data.ai_summary
      setTypedSummary("")
      
      const interval = setInterval(() => {
        setTypedSummary((prev) => fullText.slice(0, i + 1))
        i++
        if (i >= fullText.length) {
          clearInterval(interval)
          setIsTyping(false)
        }
      }, 15)
      
      return () => clearInterval(interval)
    }
  }, [data?.ai_summary, isLoading])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-48 w-full rounded-3xl bg-white/5 animate-pulse border border-white/10 relative overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-1/3 rounded-full bg-white/10 animate-pulse" />
          <div className="h-20 w-full rounded-2xl bg-white/5 animate-pulse" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-6">
      {/* AI Intelligence Header Section */}
      <motion.section 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="group relative"
      >
        {/* Animated Background Glow */}
        <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-indigo-500 via-emerald-500 to-blue-500 opacity-20 blur-xl transition duration-1000 group-hover:opacity-40 group-hover:duration-200 animate-pulse" />
        
        <div className="relative rounded-[1.8rem] border border-white/10 bg-black/40 backdrop-blur-3xl p-8 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-1 rounded-2xl bg-emerald-500 opacity-20 blur animate-pulse" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Sparkles className="h-7 w-7" />
                </div>
              </div>
              <div>
                <h4 className="text-lg font-black text-white tracking-tight">Análise de IA Atlas</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest">AIOps Engine v5 Active</p>
                </div>
              </div>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 px-3 py-1 text-[10px] font-black tracking-tighter">
              98.4% CONFIANÇA
            </Badge>
          </div>
          
          <div className="relative min-h-[100px]">
            <p className="text-base leading-relaxed text-white/90 font-medium">
              {typedSummary}
              {isTyping && <span className="inline-block w-1.5 h-5 ml-1 bg-emerald-500 animate-pulse align-middle" />}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 pt-6 border-t border-white/5">
             <Button variant="outline" size="sm" className="h-8 rounded-full bg-white/5 border-white/10 text-[10px] font-bold gap-2 hover:bg-white/10">
               <Copy className="h-3 w-3" /> COPIAR RESUMO
             </Button>
             <Button variant="outline" size="sm" className="h-8 rounded-full bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[10px] font-bold gap-2 hover:bg-emerald-500/20">
               <Zap className="h-3 w-3" /> APLICAR RECOMENDAÇÃO
             </Button>
          </div>
        </div>
      </motion.section>

      {/* Recommended Solution Section */}
      {data?.suggestions?.[0] && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
             <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/5" />
             <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Solução de Alta Prioridade</h4>
             <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/5" />
          </div>
          
          <Link
            href={`/articles/${data.suggestions[0].slug}`}
            target="_blank"
            className="group relative flex items-center gap-6 rounded-[1.5rem] border border-white/5 bg-white/5 p-6 transition-all hover:border-emerald-500/30 hover:bg-white/10"
          >
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 group-hover:bg-emerald-500/20 transition-all duration-500 shadow-xl shadow-emerald-500/5">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors leading-tight">{data.suggestions[0].title}</p>
              <p className="text-xs text-white/40 font-medium">Procedimento padrão validado para resolução do card.</p>
            </div>
            <ChevronRight className="h-6 w-6 text-white/10 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
          </Link>
        </motion.div>
      )}

      {/* Footer Branding */}
      <div className="flex items-center justify-center gap-4 py-4">
         <div className="h-[1px] flex-1 bg-white/5" />
         <div className="flex items-center gap-2 opacity-30 grayscale hover:grayscale-0 transition-all cursor-default">
            <Activity className="h-3 w-3" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em] whitespace-nowrap">Atlas Cognitive Engine v5</span>
         </div>
         <div className="h-[1px] flex-1 bg-white/5" />
      </div>
    </div>
  )
}
