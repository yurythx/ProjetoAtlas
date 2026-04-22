"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Box, Camera, Loader2, Search, Trash2, X, Zap, TrendingUp, BookOpen, Layers, Sparkles, ShieldCheck, Star, Smile, Clock, Target, MessageSquare } from "lucide-react"
import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { Deal, DealActivity, isCRMNetworkError, useCRM, useServiceCatalog, useCMDB, useXLA, useDealTopology } from "./use-crm"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn, fixImageUrl } from "@/lib/utils"
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
  const [draftWorkaround, setDraftWorkaround] = useState("")
  const [draftResolutionSteps, setDraftResolutionSteps] = useState("")
  const [draftIsKnownError, setDraftIsKnownError] = useState(false)
  const [draftChangeType, setDraftChangeType] = useState<Deal["change_type"]>("normal")
  const [draftChangeImpact, setDraftChangeImpact] = useState("")
  const [draftCabApproval, setDraftCabApproval] = useState(false)
  const [draftCabDate, setDraftCabDate] = useState<string>("")
  const [userSearch, setUserSearch] = useState("")
  const [draftUpdateNote, setDraftUpdateNote] = useState("")
  const [activityFilter, setActivityFilter] = useState<ActivityFilterId>("all")
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "details" | "images" | "history" | "cis" | "governance" | "xla" | "topology">("details")
  const { data: xlaFeedbacks = [], createFeedback: submitXla } = useXLA(currentDeal.id)
  
  const [xlaRating, setXlaRating] = useState(0)
  const [xlaEase, setXlaEase] = useState(0)
  const [xlaSpeed, setXlaSpeed] = useState(0)
  const [xlaOutcome, setXlaOutcome] = useState(0)
  const [xlaComment, setXlaComment] = useState("")

  const { data: topologyData, isLoading: isLoadingTopology } = useDealTopology(currentDeal.id)
  const handleDraftAIProblemReport = () => {
    const riskFactors = currentDeal.ai_metadata?.risk_factors || []
    const baseText = currentDeal.description || "N/A"
    
    const rca = `[DRAFT IA] - BASEADO NO FLUXO DE VALOR\n\nCausa Provável: Analisando os sinais detectados (${riskFactors.join(", ")}), o problema parece estar relacionado à estagnação do fluxo em etapas críticas.\n\nEvidência Primária: ${baseText.substring(0, 100)}...`
    
    const workaround = "Reiniciar serviços vinculados e limpar cache de processamento conforme KEDB standard."
    const resolution = "Otimizar o WIP Limit da coluna afetada e automatizar o gatilho de transição para evitar novos bloqueios."

    setDraftRootCause(rca)
    setDraftWorkaround(workaround)
    setDraftResolutionSteps(resolution)
    toast.success("Draft de Investigação gerado pela IA com sucesso!")
  }

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
    setDraftResolutionSteps(currentDeal.resolution_steps || "")
    setDraftWorkaround(currentDeal.workaround || "")
    setDraftIsKnownError(currentDeal.is_known_error || false)
    setDraftChangeType(currentDeal.change_type || "normal")
    setDraftChangeImpact(currentDeal.change_impact || "")
    setDraftCabApproval(currentDeal.cab_approval || false)
    setDraftCabDate(currentDeal.cab_date || "")
    
    setXlaRating(0)
    setXlaEase(0)
    setXlaSpeed(0)
    setXlaOutcome(0)
    setXlaComment("")
    
    setDraftServiceItemId(
      typeof currentDeal.service_item === "object" && currentDeal.service_item !== null
        ? String(currentDeal.service_item.id)
        : currentDeal.service_item ? String(currentDeal.service_item) : "none"
    )
    setUserSearch("")
    setDraftAffectedCis(
      (currentDeal.affected_cis || []).map((ci) => (typeof ci === "object" ? ci.id : ci))
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
  const ownerUser = users.find((user) => user.id === currentDeal.owner)
  const selectedColumn = columns.find((column) => column.id.toString() === draftColumnId)
  const selectedColumnSemantics = resolveColumnSemantics(selectedColumn)
  const draftPriorityMeta = getPriorityMeta(draftPriority)
  const currentPriorityMeta = getPriorityMeta(currentDeal.priority)
  const deadlineMeta = getDeadlineMeta(currentDeal.closing_date, isDealDone(currentDeal, pipelines))
  const activities = currentDeal.activities || EMPTY_ACTIVITIES
  const latestActivity = activities[0]
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
        [...(currentDeal.affected_cis || [])]
          .map((ci) => (typeof ci === "object" ? ci.id : ci))
          .sort((a, b) => a - b)
      ) ||
    draftRiskLevel !== (currentDeal.risk_level || "none") ||
    draftChangeJustification !== (currentDeal.change_justification || "") ||
    draftImplementationPlan !== (currentDeal.implementation_plan || "") ||
    draftBackoutPlan !== (currentDeal.backout_plan || "") ||
    draftTestPlan !== (currentDeal.test_plan || "") ||
    draftRootCause !== (currentDeal.root_cause || "") ||
    draftWorkaround !== (currentDeal.workaround || "") ||
    draftResolutionSteps !== (currentDeal.resolution_steps || "") ||
    draftIsKnownError !== (currentDeal.is_known_error || false) ||
    draftChangeType !== (currentDeal.change_type || "normal") ||
    draftChangeImpact !== (currentDeal.change_impact || "") ||
    draftCabApproval !== (currentDeal.cab_approval || false) ||
    draftCabDate !== (currentDeal.cab_date || "") ||
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
      (currentDeal.affected_cis || []).map((ci) => (typeof ci === "object" ? ci.id : ci))
    )
    setDraftRiskLevel(currentDeal.risk_level || "none")
    setDraftChangeJustification(currentDeal.change_justification || "")
    setDraftImplementationPlan(currentDeal.implementation_plan || "")
    setDraftBackoutPlan(currentDeal.backout_plan || "")
    setDraftTestPlan(currentDeal.test_plan || "")
    setDraftRootCause(currentDeal.root_cause || "")
    setDraftWorkaround(currentDeal.workaround || "")
    setDraftResolutionSteps(currentDeal.resolution_steps || "")
    setDraftIsKnownError(currentDeal.is_known_error || false)
    setDraftChangeType(currentDeal.change_type || "normal")
    setDraftChangeImpact(currentDeal.change_impact || "")
    setDraftCabApproval(currentDeal.cab_approval || false)
    setDraftCabDate(currentDeal.cab_date || "")
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
      workaround: draftWorkaround,
      resolution_steps: draftResolutionSteps,
      is_known_error: draftIsKnownError,
      change_type: draftChangeType,
      change_impact: draftChangeImpact,
      cab_approval: draftCabApproval,
      cab_date: draftCabDate || null,
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
          "w-[calc(100vw-1.5rem)] sm:w-auto max-h-[calc(100vh-1.5rem)] overflow-hidden border border-white/10 bg-background/30 p-0 backdrop-blur-3xl rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] grid grid-rows-[auto_1fr] animate-in zoom-in-95 duration-300",
          activeTab === "images" ? "sm:max-w-[1440px]" : "sm:max-w-[1120px]"
        )}
      >
        {currentDeal.swarm?.is_active && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center justify-between relative overflow-hidden group/swarm">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent animate-pulse" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="h-12 w-12 rounded-2xl bg-amber-500 border border-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover/swarm:scale-110 transition-transform">
                <Zap className="h-6 w-6 text-white fill-white animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500/80 mb-0.5">Operação Swarming Ativa</p>
                <h4 className="text-sm font-black text-amber-700 uppercase tracking-tighter">War Room Colaborativa de Alta Performance</h4>
              </div>
            </div>
            <div className="flex items-center gap-4 relative z-10">
                <div className="flex -space-x-3">
                {currentDeal.swarm.participant_names.slice(0, 5).map((name, i) => (
                    <Avatar key={i} className="h-9 w-9 border-2 border-background shadow-xl ring-2 ring-amber-500/20">
                    <AvatarFallback className="text-[10px] bg-amber-100 text-amber-900 font-black">{getUserInitials(name)}</AvatarFallback>
                    </Avatar>
                ))}
                {currentDeal.swarm.participant_names.length > 5 && (
                    <div className="h-9 w-9 border-2 border-background bg-amber-500 rounded-full flex items-center justify-center text-[10px] font-black text-white z-10 shadow-xl">
                    +{currentDeal.swarm.participant_names.length - 5}
                    </div>
                )}
                </div>
                <div className="h-8 w-[1px] bg-amber-500/20 mx-2 hidden sm:block" />
                <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => endSwarm.mutate(currentDeal.id)}
                    className="h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-amber-600 hover:bg-amber-500 hover:text-white transition-all active:scale-95 border border-amber-500/20"
                >
                    Finalizar Missão
                </Button>
            </div>
          </div>
        )}
        <DialogHeader className="border-b border-white/5 bg-white/5 px-8 py-8 text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-[0.03] rotate-12 pointer-events-none">
             <Target className="h-48 w-48 text-primary" />
          </div>
          <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between relative z-10">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline" className="h-6 px-3 rounded-lg border-white/10 bg-white/5 font-black uppercase tracking-widest text-[9px] text-muted-foreground/60">{selectedColumn?.title || getDealColumnTitle(currentDeal)}</Badge>
                <Badge variant="outline" className="h-6 px-3 rounded-lg border-primary/20 bg-primary/5 font-black uppercase tracking-widest text-[9px] text-primary">
                  {draftRecordType === 'service_request' ? 'Requisição' : 
                   draftRecordType === 'incident' ? 'Incidente' :
                   draftRecordType === 'problem' ? 'Problema' :
                   draftRecordType === 'change' ? 'Mudança' : 'Oportunidade'}
                </Badge>
                <Badge className={cn("h-6 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg", draftPriorityMeta.className)}>{draftPriorityMeta.label}</Badge>
                <Badge className={cn("h-6 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg", draftProgressMeta.badgeClassName)}>{safeDraftProgress}%</Badge>
                <Badge className={cn("h-6 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] shadow-lg", deadlineMeta.badgeClassName)}>{deadlineMeta.label}</Badge>
                
                {currentDeal.sla_status && (
                  <Badge className={cn(
                    "h-6 px-3 rounded-lg uppercase font-black tracking-widest text-[9px] shadow-lg",
                    currentDeal.sla_status === "breached" ? "bg-red-600 text-white" : 
                    currentDeal.sla_status === "at_risk" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
                  )}>
                    SLA: {currentDeal.sla_status === "breached" ? "Violado" : currentDeal.sla_status === "at_risk" ? "Em Risco" : "OK"}
                  </Badge>
                )}
                {hasChanges && <Badge variant="outline" className="h-6 px-3 rounded-lg border-amber-500/20 bg-amber-500/10 text-amber-500 font-black uppercase tracking-widest text-[9px] animate-pulse">Draft Pendente</Badge>}
              </div>
              
              <div className="space-y-2">
                <DialogTitle className="text-4xl font-black tracking-tighter uppercase leading-[0.9] max-w-[700px]">{currentDeal.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-4 text-sm pt-2">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
                        <Avatar className="h-6 w-6 rounded-lg border-2 border-white/10">
                            <AvatarFallback className="text-[8px] font-black bg-primary/10 text-primary">{getUserInitials(currentDeal.contact_name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{currentDeal.contact_name}</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/5 border border-white/5 shadow-inner">
                        <Avatar className="h-6 w-6 rounded-lg border-2 border-white/10">
                            <AvatarFallback className="text-[8px] font-black bg-primary/10 text-primary">{getUserInitials(ownerUser ? getUserDisplayName(ownerUser) : "U")}</AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] font-black uppercase tracking-widest text-foreground">{ownerUser ? getUserDisplayName(ownerUser) : `Usuário #${currentDeal.owner}`}</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-2">
                    {latestActivity
                        ? `Auditado ${formatDistanceToNow(new Date(latestActivity.created_at), { addSuffix: true, locale: ptBR })}`
                        : "Sem rastro de auditoria"}
                    </span>
                </DialogDescription>
              </div>
            </div>

            <div className="flex flex-col gap-6 xl:min-w-[380px] xl:items-end">
              <div className="text-left xl:text-right w-full">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mb-1">
                  Mensuração de Valor
                </div>
                <div className="text-5xl font-black tracking-tighter text-emerald-500 tabular-nums">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(currentDeal.value))}
                </div>
                {currentDeal.closing_date && (
                  <div className="mt-2 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/60 flex items-center justify-start xl:justify-end gap-2">
                    <Calendar className="h-3 w-3" />
                    Deadline: {format(new Date(currentDeal.closing_date), "dd MMMM, yyyy", { locale: ptBR })}
                  </div>
                )}
                
                <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl relative overflow-hidden group/progress">
                  <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                  <div className="flex items-center justify-between gap-3 relative z-10">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/60">Status da Jornada</span>
                    <Badge className={cn("rounded-lg font-black uppercase tracking-widest text-[9px]", draftProgressMeta.badgeClassName)}>{draftProgressMeta.label}</Badge>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/5 shadow-inner relative z-10">
                    <div
                      className={cn("h-full transition-all duration-1000 ease-out", draftProgressMeta.barClassName)}
                      style={{ width: `${safeDraftProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-end relative z-10">
                     <div className="text-2xl font-black tracking-tighter tabular-nums">{safeDraftProgress}%</div>
                     <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 pb-1">Concluído</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end w-full">
                 {canOpenMessenger ? (
                  <Button asChild variant="outline" className="h-12 rounded-2xl px-6 font-black uppercase tracking-widest text-[10px] border-white/10 bg-white/5 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all active:scale-95 shadow-lg">
                    <Link href={`/messenger?conversation=${currentDeal.messenger_conversation}`} target="_blank" rel="noreferrer">
                      <MessageSquare className="mr-3 h-4 w-4" />
                      Protocolo de Chat
                    </Link>
                  </Button>
                ) : null}

                {!currentDeal.swarm?.is_active && (
                  <Button 
                    onClick={() => startSwarm.mutate(currentDeal.id)}
                    className="h-12 rounded-2xl px-6 font-black uppercase tracking-widest text-[10px] bg-amber-500 hover:bg-amber-600 border-none text-white shadow-xl shadow-amber-500/20 active:scale-95 transition-all"
                  >
                    <Zap className="mr-3 h-4 w-4 fill-white" />
                    Ativar Swarm
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  onClick={resetDraft}
                  disabled={!hasChanges || updateDeal.isPending}
                  className="h-12 rounded-2xl px-6 font-black uppercase tracking-widest text-[10px] border-white/10 hover:bg-white/10 transition-all"
                >
                  Resetar
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={!hasChanges || updateDeal.isPending}
                  className="h-12 rounded-2xl px-8 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-primary/20 active:scale-95 transition-all"
                >
                  {updateDeal.isPending ? <Loader2 className="mr-3 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-3 h-4 w-4" />}
                  Atualizar Master
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 h-full overflow-y-auto">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="h-full">
            <div className="sticky top-0 z-20 border-b border-white/5 bg-background/60 backdrop-blur-3xl px-8">
              <TabsList className="h-16 w-full justify-start gap-8 bg-transparent p-0">
                {[
                  { id: "details", label: "Arquitetura", icon: Layers },
                  { id: "images", label: "Galeria Visual", icon: Camera },
                  { id: "overview", label: "Visão Geral", icon: LayoutList },
                  { id: "cis", label: "IT Infrastructure", icon: ShieldCheck },
                  { id: "topology", label: "Topologia 360°", icon: Target },
                  ...(draftRecordType === 'change' ? [{ id: "governance", label: "Governança", icon: ShieldCheck }] : []),
                  ...(draftRecordType === 'problem' ? [{ id: "governance", label: "Investigação", icon: ShieldCheck }] : []),
                  { id: "xla", label: "Sentiment Index", icon: Smile },
                  { id: "history", label: "Audit Log", icon: Clock },
                ].map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="relative h-16 rounded-none border-b-2 border-transparent px-1 pb-4 pt-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 transition-all data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary hover:text-foreground group"
                  >
                    <tab.icon className="mr-2.5 h-4 w-4 transition-transform group-hover:scale-110" />
                    {tab.label}
                    {tab.id === "images" && (attachments.length + totalQueuedAttachments + totalPendingUploads) > 0 && (
                      <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[8px] font-black bg-primary/10 text-primary border-none">
                        {attachments.length + totalQueuedAttachments + totalPendingUploads}
                      </Badge>
                    )}
                    {tab.id === "cis" && draftAffectedCis.length > 0 && (
                      <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[8px] font-black bg-primary/10 text-primary border-none">
                        {draftAffectedCis.length}
                      </Badge>
                    )}
                    {tab.id === "history" && activities.length > 0 && (
                      <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[8px] font-black bg-primary/10 text-primary border-none">
                        {activities.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prioridade</p>
                  <div className="mt-3">
                    <Badge className={draftPriorityMeta.className}>{draftPriorityMeta.label}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Antes: {currentPriorityMeta.label}. Agora: {draftPriorityMeta.label}.
                  </p>
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

              {currentDeal.ai_metadata && (
                <motion.section 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[2rem] border-2 border-primary/20 bg-primary/5 p-6 shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <Sparkles className="h-20 w-20 text-primary" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg">
                          <Activity className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-widest text-primary">IA Governance Insights</h3>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Análise preditiva ITIL v5</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-primary">{currentDeal.ai_metadata.risk_score || 0}%</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-black">Score de Risco</p>
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-3">
                        <p className="text-xs font-black uppercase tracking-tighter text-muted-foreground">Fatores de Risco Detectados</p>
                        <div className="flex flex-wrap gap-2">
                          {(currentDeal.ai_metadata.risk_factors || []).map((f: string, i: number) => (
                            <Badge key={i} variant="secondary" className="bg-white/50 border-primary/10 text-[10px] px-3 py-1">
                              {f}
                            </Badge>
                          ))}
                          {(!currentDeal.ai_metadata.risk_factors || currentDeal.ai_metadata.risk_factors.length === 0) && (
                            <p className="text-xs italic text-muted-foreground">Nenhum fator crítico detectado.</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs font-black uppercase tracking-tighter text-muted-foreground">Next Best Action (Sugerido)</p>
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary text-white shadow-lg">
                          <Rocket className="h-5 w-5" />
                          <p className="text-sm font-black italic">{currentDeal.ai_metadata.next_best_action || "Manter monitoramento"}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}

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
                  <div className="mt-4">
                    <Button type="button" variant="outline" size="sm" onClick={() => setActiveTab("history")}>
                      Ver histórico completo
                    </Button>
                  </div>
                </section>
              ) : null}
            </TabsContent>

            <TabsContent value="details" className="mt-0 space-y-6 p-4 sm:p-6">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_380px]">
                <div className="space-y-6">
                  <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Atualização do trabalho</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Escreva como se fosse a atualização principal do item no board: contexto, andamento, bloqueios e próximos passos.
                        </p>
                      </div>
                      <Badge variant={hasChanges ? "default" : "outline"}>
                        {hasChanges ? "Pronto para salvar" : "Sem alterações"}
                      </Badge>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Descrição do que está sendo feito</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Este campo funciona como o update central do card, semelhante ao painel lateral do Monday.com.
                        </p>
                        <Textarea
                          value={draftDescription}
                          onChange={(event) => setDraftDescription(event.target.value)}
                          placeholder="Descreva o andamento, bloqueios, próximos passos e contexto do card..."
                          className="mt-4 min-h-[320px] resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        />
                      </div>

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
                  </section>
                </div>

                <div className="space-y-6">
                  {/* Atlas AI Advisor - ITIL Version 5 Autonomic Intelligence */}
                  <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3 relative overflow-hidden group shadow-lg shadow-primary/5">
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-20 transition-opacity">
                      <Sparkles className="h-16 w-16 text-primary" />
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center animate-pulse">
                        <Zap className="h-3 w-3 text-primary-foreground fill-current" />
                      </div>
                      <Badge className="bg-primary hover:bg-primary/90 text-[10px] h-5 font-black uppercase tracking-wider">Atlas AI Advisor</Badge>
                    </div>

                    <div className="space-y-4">
                      <div className="p-3 rounded-xl bg-background/60 border border-primary/10 shadow-inner">
                        <h4 className="text-[10px] font-black uppercase text-primary/80 mb-2 flex items-center gap-2 tracking-widest">
                          Diagnóstico Sugerido
                        </h4>
                        <p className="text-sm text-foreground font-medium leading-relaxed italic">
                          "{currentDeal.ai_metadata?.suggested_diagnosis || "Analisando padrões históricos e fluxos VSM para este chamado..."}"
                        </p>
                      </div>

                      {currentDeal.ai_metadata?.resolution_steps && (
                        <div className="space-y-2">
                           <h4 className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2 tracking-widest">
                             <ShieldCheck className="h-3 w-3 text-emerald-500" /> Resolution Logic
                           </h4>
                           <div className="space-y-1">
                             {Array.isArray(currentDeal.ai_metadata.resolution_steps) ? currentDeal.ai_metadata.resolution_steps.map((step: string, idx: number) => (
                               <div key={idx} className="flex gap-2 items-start text-xs text-muted-foreground group/step">
                                 <span className="text-primary font-bold">0{idx + 1}.</span>
                                 <span className="group-hover/step:text-foreground transition-colors">{step}</span>
                               </div>
                             )) : (
                               <p className="text-xs text-muted-foreground">{currentDeal.ai_metadata.resolution_steps}</p>
                             )}
                           </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-2 rounded-xl bg-background/50 border border-primary/5 text-center">
                          <p className="text-[9px] uppercase font-black text-muted-foreground tracking-tighter">SLA Breach Risk</p>
                          <p className={cn(
                            "text-xl font-black tracking-tighter",
                            (currentDeal.ai_metadata?.risk_score || 0) > 70 ? "text-rose-500" : "text-emerald-500"
                          )}>
                            {currentDeal.ai_metadata?.risk_score || "12"}%
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-background/50 border border-primary/5 text-center">
                          <p className="text-[9px] uppercase font-black text-muted-foreground tracking-tighter">Market Value XLA</p>
                          <p className="text-xl font-black text-primary tracking-tighter">
                            {currentDeal.ai_metadata?.xla_impact || "HIGH"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Campos principais</h3>

                    <div className="space-y-4">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coluna</p>
                        <p className="mt-1 text-sm text-muted-foreground">Atualize o andamento do card sem sair do painel.</p>
                        <Select value={draftColumnId} onValueChange={setDraftColumnId}>
                          <SelectTrigger className="mt-3">
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
                        {!selectedColumnGuard.allowed && (
                          <p className="mt-3 text-xs font-medium text-amber-700">
                            {selectedColumnGuard.reason}
                          </p>
                        )}
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Catálogo de Serviços</p>
                        <p className="mt-1 text-sm text-muted-foreground">Vincule este card a um serviço do catálogo para aplicar SLAs e fluxos automáticos.</p>
                        <Select value={draftServiceItemId} onValueChange={setDraftServiceItemId}>
                          <SelectTrigger className="mt-3">
                            <SelectValue placeholder="Selecione um serviço" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum serviço</SelectItem>
                            {items.map((item) => (
                              <SelectItem key={item.id} value={String(item.id)}>
                                {item.category_name && <span className="text-[10px] text-muted-foreground block uppercase">{item.category_name}</span>}
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {draftServiceItemId !== "none" && (
                          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                            <div className="h-1 w-1 rounded-full bg-primary/40" />
                            SLA Padrão: {items.find((item: { id: number | string }) => String(item.id) === draftServiceItemId)?.sla_policy_name || "Conforme modalidade"}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tipo de registro (ITIL version 5)</p>
                        <p className="mt-1 text-sm text-muted-foreground">Classifique o card conforme o processo ITIL version 5.</p>
                        <Select value={draftRecordType} onValueChange={(value) => setDraftRecordType(value as Deal["record_type"])}>
                          <SelectTrigger className="mt-3">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="incident">Incidente</SelectItem>
                            <SelectItem value="service_request">Requisição de Serviço</SelectItem>
                            <SelectItem value="problem">Problema</SelectItem>
                            <SelectItem value="change">Mudança</SelectItem>
                            <SelectItem value="opportunity">Oportunidade (Vendas)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prioridade</p>
                        <p className="mt-1 text-sm text-muted-foreground">Destaque rápido para urgência e foco do time.</p>
                        <Select value={draftPriority} onValueChange={(value) => setDraftPriority(value as Deal["priority"])}>
                          <SelectTrigger className="mt-3">
                            <SelectValue placeholder="Selecione a prioridade" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LOW">Baixa</SelectItem>
                            <SelectItem value="MEDIUM">Média</SelectItem>
                            <SelectItem value="HIGH">Alta</SelectItem>
                            <SelectItem value="URGENT">Urgente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progresso</p>
                        <p className="mt-1 text-sm text-muted-foreground">Defina o percentual de conclusão do trabalho em andamento.</p>
                        <div className="mt-3 flex items-center gap-3">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={draftProgress}
                            onChange={(event) => setDraftProgress(event.target.value)}
                            className="max-w-[120px] font-semibold"
                            aria-label="Editar progresso do card no painel"
                          />
                          <Badge className={draftProgressMeta.badgeClassName}>{safeDraftProgress}%</Badge>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full transition-all", draftProgressMeta.barClassName)}
                            style={{ width: `${safeDraftProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pessoas</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Organize responsáveis relacionados ao card em um painel editável no estilo Monday.</p>
                    </div>

                    <div className="space-y-4">
                      {selectedUsers.length > 0 && (
                        <div className="rounded-2xl border bg-background p-4">
                          <p className="text-sm font-medium">Time relacionado</p>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {selectedUsers.map((user) => {
                              const displayName = getUserDisplayName(user)

                              return (
                                <div key={user.id} className="flex items-center gap-2 rounded-full border bg-card px-2 py-1">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="text-[11px] font-semibold">
                                      {getUserInitials(displayName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm">{displayName}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium">Usuários relacionados</p>
                        <div className="relative mt-3">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={userSearch}
                            onChange={(event) => setUserSearch(event.target.value)}
                            placeholder="Buscar por nome, usuário ou e-mail"
                            className="pl-9"
                          />
                        </div>

                        <ScrollArea className="mt-4 h-72 rounded-2xl border">
                          <div className="space-y-2 p-3">
                            {filteredUsers.length > 0 ? (
                              filteredUsers.map((user) => {
                                const checked = draftRelatedUsers.includes(user.id)
                                const displayName = getUserDisplayName(user)

                                return (
                                  <label
                                    key={user.id}
                                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary/30 bg-primary/5" : "bg-background/70 hover:bg-muted/40"}`}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      onClick={(event) => {
                                        event.preventDefault()
                                        handleToggleRelatedUser(user.id, !checked)
                                      }}
                                      onCheckedChange={(value) => handleToggleRelatedUser(user.id, value === true)}
                                    />
                                    <Avatar className="h-10 w-10">
                                      <AvatarFallback className="text-xs font-semibold">
                                        {getUserInitials(displayName)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium">{displayName}</p>
                                        {checked && <Badge variant="secondary">Selecionado</Badge>}
                                      </div>
                                      <p className="text-xs text-muted-foreground">{user.email || user.username}</p>
                                    </div>
                                  </label>
                                )
                              })
                            ) : (
                              <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                                Nenhum usuário encontrado para a busca atual.
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
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

                <div className="space-y-8">
                  {/* XLA Feedback form - available for any deal */}
                  {(
                    <div className="rounded-3xl border-2 border-primary/20 bg-primary/5 p-6 shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                         <Smile className="h-24 w-24 text-primary" />
                      </div>
                      
                      <div className="relative z-10 space-y-6">
                        <div className="flex items-center gap-2">
                           <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                           <p className="text-sm font-black uppercase tracking-widest text-primary">Novo Feedback XLA</p>
                        </div>
                        
                        <div className="grid gap-8 md:grid-cols-2">
                           {/* Main Rating */}
                           <div className="space-y-4">
                              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <Star className="h-3 w-3" /> Satisfação Geral (1-10)
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                 {[1,2,3,4,5,6,7,8,9,10].map(n => (
                                   <button 
                                     key={n} 
                                     onClick={() => setXlaRating(n)}
                                     className={cn(
                                       "h-9 w-9 rounded-xl border font-bold text-sm transition-all",
                                       xlaRating === n 
                                         ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-110" 
                                         : "bg-background hover:border-primary/50"
                                     )}
                                   >
                                     {n}
                                   </button>
                                 ))}
                              </div>
                           </div>

                           {/* Metrics Grid */}
                           <div className="space-y-5">
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                    <Smile className="h-3 w-3" /> Facilidade de Uso
                                  </label>
                                  <span className="text-xs font-bold text-primary">{xlaEase}/10</span>
                                </div>
                                <Input 
                                  type="range" min="0" max="10" step="1" 
                                  value={xlaEase} onChange={(e) => setXlaEase(Number(e.target.value))}
                                  className="h-1.5 accent-primary p-0 bg-slate-200"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="h-3 w-3" /> Velocidade de Entrega
                                  </label>
                                  <span className="text-xs font-bold text-primary">{xlaSpeed}/10</span>
                                </div>
                                <Input 
                                  type="range" min="0" max="10" step="1" 
                                  value={xlaSpeed} onChange={(e) => setXlaSpeed(Number(e.target.value))}
                                  className="h-1.5 accent-primary p-0 bg-slate-200"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                                    <Target className="h-3 w-3" /> Resultado Alcançado
                                  </label>
                                  <span className="text-xs font-bold text-primary">{xlaOutcome}/10</span>
                                </div>
                                <Input 
                                  type="range" min="0" max="10" step="1" 
                                  value={xlaOutcome} onChange={(e) => setXlaOutcome(Number(e.target.value))}
                                  className="h-1.5 accent-primary p-0 bg-slate-200"
                                />
                              </div>
                           </div>
                        </div>

                        <div className="space-y-3">
                           <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                             <MessageSquare className="h-3 w-3" /> Comentário Adicional
                           </label>
                           <Textarea 
                             value={xlaComment}
                             onChange={(e) => setXlaComment(e.target.value)}
                             placeholder="Conte-nos um pouco mais sobre sua percepção..."
                             className="min-h-[100px] rounded-2xl border-primary/10 focus:border-primary/30 transition-all bg-background/50"
                           />
                        </div>

                        <div className="flex justify-end">
                           <Button 
                             disabled={xlaRating === 0 || submitXla.isPending}
                             onClick={() => {
                               submitXla.mutate({
                                 deal: currentDeal.id,
                                 contact: currentDeal.contact ?? undefined,
                                 rating: xlaRating,
                                 ease_of_use: xlaEase,
                                 speed_satisfaction: xlaSpeed,
                                 outcome_satisfaction: xlaOutcome,
                                 comment: xlaComment
                               }, {
                                 onSuccess: () => {
                                   toast.success("Feedback XLA registrado com sucesso!")
                                   setXlaRating(0)
                                   setXlaEase(0)
                                   setXlaSpeed(0)
                                   setXlaOutcome(0)
                                   setXlaComment("")
                                 }
                               })
                             }}
                             className="px-8 rounded-xl font-bold uppercase tracking-widest text-[10px]"
                           >
                             {submitXla.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2 fill-current" />}
                             Publicar Experiência
                           </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Linha do Tempo de Satisfação</p>
                      <Badge variant="outline" className="text-[9px] uppercase font-bold">ITIL v5 Compliance</Badge>
                    </div>

                    {xlaFeedbacks.length > 0 ? (
                      <div className="grid gap-4">
                        {xlaFeedbacks.map((f: any) => (
                          <motion.div 
                            key={f.id} 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="rounded-3xl border bg-card p-6 space-y-4 hover:shadow-md transition-all relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between relative z-10">
                               <div className="flex items-center gap-3">
                                 <div className={cn(
                                   "h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-sm",
                                   f.rating >= 8 ? "bg-emerald-500/10 text-emerald-600" : 
                                   f.rating >= 5 ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"
                                 )}>
                                   {f.rating}
                                 </div>
                                 <div>
                                   <p className="text-sm font-bold">{f.contact_name || "Usuário Final"}</p>
                                   <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                                     {format(new Date(f.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                                   </p>
                                 </div>
                               </div>
                               <Badge variant="outline" className="border-primary/10 text-[10px] font-bold uppercase">Score: {f.rating}/10</Badge>
                            </div>

                            {f.comment && (
                              <div className="relative p-4 rounded-2xl bg-muted/30 italic text-sm text-foreground/80 leading-relaxed">
                                 <span className="absolute -top-2 -left-1 text-4xl text-primary/10 font-serif">"</span>
                                 {f.comment}
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-4">
                               <div className="space-y-1">
                                  <div className="flex justify-between text-[8px] font-black uppercase text-muted-foreground tracking-widest">
                                    <span>Facilidade</span>
                                    <span>{f.ease_of_use}/10</span>
                                  </div>
                                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${f.ease_of_use * 10}%` }} />
                                  </div>
                               </div>
                               <div className="space-y-1">
                                  <div className="flex justify-between text-[8px] font-black uppercase text-muted-foreground tracking-widest">
                                    <span>Velocidade</span>
                                    <span>{f.speed_satisfaction}/10</span>
                                  </div>
                                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500" style={{ width: `${f.speed_satisfaction * 10}%` }} />
                                  </div>
                               </div>
                               <div className="space-y-1">
                                  <div className="flex justify-between text-[8px] font-black uppercase text-muted-foreground tracking-widest">
                                    <span>Resultado</span>
                                    <span>{f.outcome_satisfaction}/10</span>
                                  </div>
                                  <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${f.outcome_satisfaction * 10}%` }} />
                                  </div>
                               </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                      <div className="rounded-3xl border border-dashed p-12 text-center space-y-4">
                        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto opacity-50">
                           <Smile className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">Nenhum feedback XLA registrado ainda para este fluxo.</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </TabsContent>

            <TabsContent value="governance" className="mt-0 space-y-6 p-4 sm:p-6">
              {draftRecordType === 'change' && (
                <div className="space-y-6">
                  <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Governança de Mudança</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Documentação obrigatória para requisições de mudança (RFC) conforme ITIL version 5.
                        </p>
                      </div>
                      <Badge variant={draftCabApproval ? "default" : "outline"} className={cn(draftCabApproval && "bg-emerald-500 hover:bg-emerald-600")}>
                        {draftCabApproval ? "Aprovado pelo CAB" : "Aguardando Aprovação"}
                      </Badge>
                    </div>

                    <div className="grid gap-6">
                      <div className="grid gap-4 md:grid-cols-2">
                         <div className="rounded-2xl border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Tipo de Mudança</p>
                            <Select value={draftChangeType} onValueChange={(v) => setDraftChangeType(v as any)}>
                              <SelectTrigger className="mt-3">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">Padrão (Baixo Risco)</SelectItem>
                                <SelectItem value="normal">Normal (Requer CAB)</SelectItem>
                                <SelectItem value="emergency">Emergencial (Urgente)</SelectItem>
                              </SelectContent>
                            </Select>
                         </div>
                         <div className="rounded-2xl border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nível de Risco</p>
                            <Select value={draftRiskLevel} onValueChange={(v) => setDraftRiskLevel(v as any)}>
                              <SelectTrigger className="mt-3">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Não definido</SelectItem>
                                <SelectItem value="low">Baixo</SelectItem>
                                <SelectItem value="medium">Médio</SelectItem>
                                <SelectItem value="high">Alto</SelectItem>
                                <SelectItem value="critical">Crítico</SelectItem>
                              </SelectContent>
                            </Select>
                         </div>
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <div className="flex items-center justify-between mb-3">
                           <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Aprovação CAB</p>
                           <Switch 
                             checked={draftCabApproval} 
                             onCheckedChange={setDraftCabApproval}
                           />
                        </div>
                        {draftCabApproval && (
                          <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2">
                             <p className="text-xs text-muted-foreground">Data da Reunião/Aprovação</p>
                             <Input 
                               type="datetime-local" 
                               value={draftCabDate ? draftCabDate.split('.')[0] : ''} 
                               onChange={(e) => setDraftCabDate(e.target.value)}
                             />
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium mb-3">Justificativa da Mudança</p>
                        <Textarea 
                          value={draftChangeJustification}
                          onChange={(e) => setDraftChangeJustification(e.target.value)}
                          placeholder="Por que esta mudança é necessária?"
                          className="min-h-[100px] bg-muted/20"
                        />
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium mb-3">Impacto Esperado</p>
                        <Textarea 
                          value={draftChangeImpact}
                          onChange={(e) => setDraftChangeImpact(e.target.value)}
                          placeholder="Quais sistemas ou usuários serão afetados durante a transição?"
                          className="min-h-[100px] bg-muted/20"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                         <div className="space-y-4">
                            <div className="rounded-2xl border bg-background p-4">
                              <p className="text-sm font-medium mb-3 text-primary flex items-center gap-2">
                                <Layers className="h-4 w-4" /> Plano de Implementação
                              </p>
                              <Textarea 
                                value={draftImplementationPlan}
                                onChange={(e) => setDraftImplementationPlan(e.target.value)}
                                placeholder="Passo a passo técnico..."
                                className="min-h-[150px]"
                              />
                            </div>
                            <div className="rounded-2xl border bg-background p-4">
                              <p className="text-sm font-medium mb-3 text-rose-600 flex items-center gap-2">
                                <Trash2 className="h-4 w-4" /> Plano de Backout (Rollback)
                              </p>
                              <Textarea 
                                value={draftBackoutPlan}
                                onChange={(e) => setDraftBackoutPlan(e.target.value)}
                                placeholder="Como reverter em caso de falha?"
                                className="min-h-[150px]"
                              />
                            </div>
                         </div>
                         <div className="space-y-4">
                            <div className="rounded-2xl border bg-background p-4">
                              <p className="text-sm font-medium mb-3 text-amber-600 flex items-center gap-2">
                                <Zap className="h-4 w-4" /> Plano de Testes
                              </p>
                              <Textarea 
                                value={draftTestPlan}
                                onChange={(e) => setDraftTestPlan(e.target.value)}
                                placeholder="Como validar que a mudança foi bem sucedida?"
                                className="min-h-[150px]"
                              />
                            </div>
                            <div className="rounded-2xl border border-dashed bg-muted/10 p-6 flex flex-col items-center justify-center text-center space-y-3">
                               <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                 <ShieldCheck className="h-6 w-6 text-primary" />
                               </div>
                               <p className="text-xs font-bold uppercase text-muted-foreground">Compliance ITIL v5</p>
                               <p className="text-[10px] text-muted-foreground max-w-[200px]">
                                 O preenchimento completo destes campos é vital para a auditoria e governança do valor.
                               </p>
                            </div>
                         </div>
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {draftRecordType === 'problem' && (
                <div className="space-y-6">
                  <section className="rounded-2xl border bg-card p-5 shadow-sm">
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Investigação de Problema</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Análise de causa raiz e gestão de erros conhecidos (KEDB).
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-3">
                         <Button 
                            size="sm" 
                            variant="outline" 
                            className="gap-2 border-primary/20 text-primary hover:bg-primary/5 font-black uppercase tracking-widest text-[10px]"
                            onClick={handleDraftAIProblemReport}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Draft RCA com IA
                          </Button>
                         <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-muted-foreground">Erro Conhecido (KEDB)?</span>
                            <Switch 
                              checked={draftIsKnownError} 
                              onCheckedChange={setDraftIsKnownError}
                            />
                         </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium mb-3 text-rose-600">Causa Raiz (Root Cause Analysis)</p>
                        <Textarea 
                          value={draftRootCause}
                          onChange={(e) => setDraftRootCause(e.target.value)}
                          placeholder="Qual a origem estrutural deste problema?"
                          className="min-h-[120px] bg-rose-50/10 border-rose-100"
                        />
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium mb-3 text-amber-600">Contorno (Workaround)</p>
                        <Textarea 
                          value={draftWorkaround}
                          onChange={(e) => setDraftWorkaround(e.target.value)}
                          placeholder="Existe uma solução paliativa para restaurar o serviço?"
                          className="min-h-[120px] bg-amber-50/10 border-amber-100"
                        />
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <p className="text-sm font-medium mb-3 text-emerald-600">Resolução Definitiva</p>
                        <Textarea 
                          value={draftResolutionSteps}
                          onChange={(e) => setDraftResolutionSteps(e.target.value)}
                          placeholder="Passos para eliminar o problema permanentemente..."
                          className="min-h-[120px] bg-emerald-50/10 border-emerald-100"
                        />
                      </div>
                    </div>
                  </section>
                </div>
              )}
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
                        {topologyData?.nodes && topologyData.nodes.length > 0 ? (
                          <div className="flex flex-col items-center gap-12">
                             {/* Central Node: The Deal */}
                             {topologyData.nodes.filter(n => n.type === 'deal').map(node => (
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
                                {topologyData.nodes.filter(n => n.type === 'ci').map(node => (
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
