import React from "react"
import { useDPSMDashboard } from "./use-crm"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Activity, Heart, Star, Users } from "lucide-react"

export function DPSMHealthWidget() {
  const { data: stats, isLoading } = useDPSMDashboard()

  if (isLoading || !stats) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-100 dark:border-emerald-900/50 shadow-sm">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Heart className="h-5 w-5 fill-current" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Saúde do Produto</p>
          <p className="text-2xl font-bold">{stats.health_score}%</p>
        </div>
      </Card>

      <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background border-amber-100 dark:border-amber-900/50 shadow-sm">
        <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
          <Star className="h-5 w-5 fill-current" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Experiência (XLA)</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold">{stats.avg_xla}</p>
            <span className="text-[10px] text-muted-foreground">/10</span>
          </div>
        </div>
      </Card>

      <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-100 dark:border-blue-900/50 shadow-sm">
        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Fluxos Ativos</p>
          <p className="text-2xl font-bold">{stats.total_active_flows}</p>
        </div>
      </Card>

      <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/20 dark:to-background border-purple-100 dark:border-purple-900/50 shadow-sm">
        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Total Feedbacks</p>
          <p className="text-2xl font-bold">{stats.xla_count}</p>
        </div>
      </Card>
    </div>
  )
}
