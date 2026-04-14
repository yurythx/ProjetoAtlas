"use client"

import { getDealColumnMeta, isDealDone, resolveColumnSemantics, getProgressValue, type CRMColumn, type Deal } from "./use-crm"

export type DeadlineRisk = "none" | "done" | "overdue" | "today" | "near" | "ok"
export type ProgressState = "not_started" | "starting" | "in_progress" | "almost_done" | "done"
export type DealStatusTone = "neutral" | "planned" | "active" | "positive" | "warning" | "danger" | "success"

export function getPriorityMeta(priority: Deal["priority"]) {
  if (priority === "LOW") {
    return {
      label: "Baixa",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    }
  }

  if (priority === "HIGH") {
    return {
      label: "Alta",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    }
  }

  if (priority === "URGENT") {
    return {
      label: "Urgente",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    }
  }

  return {
    label: "Média",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  }
}

export function getStageMeta(column?: Partial<CRMColumn> | null, fallbackTitle?: string) {
  const semantics = resolveColumnSemantics(column ?? { title: fallbackTitle })

  if (semantics.column_kind === "backlog") {
    return {
      className: "border-sky-200 bg-sky-50 text-sky-700",
    }
  }

  if (semantics.column_kind === "planned") {
    return {
      className: "border-violet-200 bg-violet-50 text-violet-700",
    }
  }

  if (semantics.column_kind === "active") {
    return {
      className: "border-amber-200 bg-amber-50 text-amber-700",
    }
  }

  if (semantics.column_kind === "done") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    }
  }

  return {
    className: "border-slate-200 bg-slate-50 text-slate-700",
  }
}

export function getDeadlineMeta(closingDate?: string, isCompleted = false) {
  if (!closingDate) {
    return {
      label: "Sem prazo",
      risk: "none" as DeadlineRisk,
      badgeClassName: "border-slate-200 bg-slate-50 text-slate-600",
      pillClassName: "text-slate-700 bg-slate-100",
    }
  }

  if (isCompleted) {
    return {
      label: "Concluído",
      risk: "done" as DeadlineRisk,
      badgeClassName: "border-emerald-300 bg-emerald-100 text-emerald-800",
      pillClassName: "text-emerald-700 bg-emerald-100",
    }
  }

  const now = new Date()
  const dueDate = new Date(closingDate)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime()
  const diffInDays = Math.floor((startOfDue - startOfToday) / 86_400_000)

  if (diffInDays < 0) {
    return {
      label: "Vencido",
      risk: "overdue" as DeadlineRisk,
      badgeClassName: "border-rose-300 bg-rose-100 text-rose-800",
      pillClassName: "text-rose-700 bg-rose-100",
    }
  }

  if (diffInDays === 0) {
    return {
      label: "Vence hoje",
      risk: "today" as DeadlineRisk,
      badgeClassName: "border-orange-300 bg-orange-100 text-orange-800",
      pillClassName: "text-orange-700 bg-orange-100",
    }
  }

  if (diffInDays <= 2) {
    return {
      label: "Perto do prazo",
      risk: "near" as DeadlineRisk,
      badgeClassName: "border-amber-300 bg-amber-100 text-amber-800",
      pillClassName: "text-amber-700 bg-amber-100",
    }
  }

  return {
    label: "No prazo",
    risk: "ok" as DeadlineRisk,
    badgeClassName: "border-emerald-300 bg-emerald-100 text-emerald-800",
    pillClassName: "text-primary/70 bg-primary/5",
  }
}

export function getProgressMeta(progress: number) {
  if (progress >= 100) {
    return {
      state: "done" as ProgressState,
      label: "Concluído",
      badgeClassName: "border-emerald-300 bg-emerald-100 text-emerald-800",
      barClassName: "bg-emerald-500",
    }
  }

  if (progress >= 75) {
    return {
      state: "almost_done" as ProgressState,
      label: "Quase lá",
      badgeClassName: "border-lime-300 bg-lime-100 text-lime-800",
      barClassName: "bg-lime-500",
    }
  }

  if (progress >= 40) {
    return {
      state: "in_progress" as ProgressState,
      label: "Em curso",
      badgeClassName: "border-sky-300 bg-sky-100 text-sky-800",
      barClassName: "bg-sky-500",
    }
  }

  if (progress > 0) {
    return {
      state: "starting" as ProgressState,
      label: "Começando",
      badgeClassName: "border-amber-300 bg-amber-100 text-amber-800",
      barClassName: "bg-amber-500",
    }
  }

  return {
    state: "not_started" as ProgressState,
    label: "Não iniciado",
    badgeClassName: "border-slate-300 bg-slate-100 text-slate-700",
    barClassName: "bg-slate-400",
  }
}

export function getDealStatusMeta(deal: Deal) {
  const progress = getProgressValue(deal)
  const currentColumn = getDealColumnMeta(deal)
  const deadline = getDeadlineMeta(deal.closing_date, isDealDone(deal))
  const semantics = resolveColumnSemantics(currentColumn)

  if (isDealDone(deal)) {
    return {
      label: "Concluído",
      className: "border-emerald-300 bg-emerald-100 text-emerald-800",
      sortValue: 5,
      tone: "success" as DealStatusTone,
    }
  }

  if (deadline.risk === "overdue") {
    return {
      label: "Vencido",
      className: "border-rose-300 bg-rose-100 text-rose-800",
      sortValue: 1,
      tone: "danger" as DealStatusTone,
    }
  }

  if (deadline.risk === "today" || deadline.risk === "near") {
    return {
      label: "Em risco",
      className: "border-amber-300 bg-amber-100 text-amber-800",
      sortValue: 2,
      tone: "warning" as DealStatusTone,
    }
  }

  if (progress >= 75) {
    return {
      label: "Quase lá",
      className: "border-lime-300 bg-lime-100 text-lime-800",
      sortValue: 4,
      tone: "positive" as DealStatusTone,
    }
  }

  if (progress >= 40 || semantics.column_kind === "active") {
    return {
      label: "Em andamento",
      className: "border-sky-300 bg-sky-100 text-sky-800",
      sortValue: 3,
      tone: "active" as DealStatusTone,
    }
  }

  if (semantics.column_kind === "planned") {
    return {
      label: "Planejado",
      className: "border-violet-300 bg-violet-100 text-violet-800",
      sortValue: 2,
      tone: "planned" as DealStatusTone,
    }
  }

  return {
    label: "Novo",
    className: "border-slate-300 bg-slate-100 text-slate-700",
    sortValue: 2,
    tone: "neutral" as DealStatusTone,
  }
}

export function isCriticalDeal(deal: Deal) {
  const deadline = getDeadlineMeta(deal.closing_date, isDealDone(deal))
  return !isDealDone(deal) && (deal.priority === "URGENT" || deadline.risk === "overdue")
}
