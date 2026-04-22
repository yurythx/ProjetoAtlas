"use client"

import { ModuleGuard } from "@/components/module-guard"
import { Protected } from "@/components/auth/protected"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { Wallet } from "lucide-react"

const TransactionList = dynamic(
  () => import("@/features/finance/transaction-list").then((m) => m.TransactionList),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-8 animate-pulse">
        <div className="h-24 bg-white/5 border border-white/10 rounded-[3rem]" />
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-white/5 border border-white/10 rounded-3xl" />
          ))}
        </div>
        <div className="h-[400px] bg-white/5 border border-white/10 rounded-[3rem]" />
      </div>
    ),
  }
)

export default function FinancePage() {
  return (
    <Protected requiredPermissions={['finance.view_financial']}>
      <ModuleGuard moduleCode="finance">
        <div className="space-y-10 animate-in fade-in duration-700">
          {/* Premium Hero Header */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between bg-white/5 backdrop-blur-xl p-8 rounded-[3rem] border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12">
               <Wallet className="h-40 w-40 text-primary" />
            </div>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-8 relative z-10">
              <div className="space-y-1">
                <h1 className="text-5xl font-black tracking-tighter flex items-center gap-6">
                    <div className="h-16 w-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                        <Wallet className="h-8 w-8 text-primary" />
                    </div>
                    Controle Financeiro
                </h1>
                <p className="text-muted-foreground text-lg font-medium ml-1 opacity-70">
                  Gestão estratégica de receitas, despesas e fluxo de caixa ITIL.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 relative z-10">
               <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Status do Caixa</p>
                  <p className="text-sm font-bold text-emerald-500">Operacional • Saudável</p>
               </div>
            </div>
          </div>
          
          <TransactionList />
        </div>
      </ModuleGuard>
    </Protected>
  )
}
