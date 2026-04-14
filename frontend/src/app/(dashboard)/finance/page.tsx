"use client"

import { PageHeader } from "@/components/ui/page-header"
import { ModuleGuard } from "@/components/module-guard"
import { Protected } from "@/components/auth/protected"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const TransactionList = dynamic(
  () => import("@/features/finance/transaction-list").then((m) => m.TransactionList),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6" role="status" aria-live="polite" aria-label="Carregando transações">
        <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-primary/5 bg-card/30 p-5 space-y-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
          <Skeleton className="h-[520px] w-full rounded-2xl" />
        </div>
      </div>
    ),
  }
)

export default function FinancePage() {
  return (
    <Protected requiredPermissions={['finance.view_financial']}>
      <ModuleGuard moduleCode="finance">
        <div className="space-y-6">
          <PageHeader
            title="Financeiro"
            description="Controle suas receitas e despesas."
          />
          
          <TransactionList />
        </div>
      </ModuleGuard>
    </Protected>
  )
}
