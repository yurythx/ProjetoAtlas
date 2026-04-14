"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Users, UserPlus, Activity, Database, ShieldCheck, FileText } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import dynamic from "next/dynamic"
import { Protected } from "@/components/auth/protected"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"

const AnalyticsChart = dynamic(() =>
  import("../../../components/dashboard/analytics-chart").then(mod => mod.AnalyticsChart),
  { ssr: false }
)

const ActivityTimeline = dynamic(() =>
  import("../../../components/dashboard/activity-timeline").then(mod => mod.ActivityTimeline),
  { ssr: false }
)

const UserList = dynamic(
  () => import("@/features/users/user-list").then((m) => m.UserList),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando usuários">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="rounded-2xl border border-primary/5 bg-card/30 p-4 shadow-sm">
          <TableSkeleton rows={7} columns={5} />
        </div>
      </div>
    ),
  }
)

function AdminPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'management' | 'analytics'>('management')

  const companySlug = typeof window !== 'undefined' ? localStorage.getItem('companySlug') : null
  const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG
  const effectiveCompany = companySlug || envCompany || 'unknown'

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      router.replace('/admin/users?create=1')
    }
  }, [router, searchParams])

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', effectiveCompany],
    queryFn: async () => {
      const res = await api.get('/api/core/dashboard/stats/')
      return res.data
    },
    refetchInterval: 30000 // Refresh every 30s
  })

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Command Center"
        description="Monitoramento centralizado e inteligência administrativa."
      >
        <Button onClick={() => router.push('/admin/users?create=1')} className="shadow-lg shadow-primary/20">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Novo Usuário
          </Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total de Usuários"
          value={stats?.counters?.users?.total ?? 0}
          icon={Users}
          isLoading={statsLoading}
          trend={stats?.counters?.users?.growth ? {
            value: stats.counters.users.growth,
            label: "crescimento",
            isPositive: true
          } : undefined}
        />
        <StatsCard
          title="Artigos Publicados"
          value={stats?.counters?.articles?.total ?? 0}
          icon={FileText}
          isLoading={statsLoading}
          description={`${stats?.counters?.articles?.total ?? 0} artigos no total`}
        />
        <StatsCard
          title="Saúde do Sistema"
          value={stats?.system_status?.api_uptime ?? "100%"}
          icon={Activity}
          isLoading={statsLoading}
          description="Todos os serviços operacionais"
        />
        <StatsCard
          title="Armazenamento"
          value={stats?.system_status?.storage_used ?? "0GB"}
          icon={Database}
          isLoading={statsLoading}
          description={`Backup: ${stats?.system_status?.last_backup ? new Date(stats.system_status.last_backup).toLocaleTimeString() : 'Recent'}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-8">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'management' | 'analytics')} className="space-y-6">
            <TabsList className="bg-muted/50 p-1 rounded-2xl border w-full justify-start md:w-auto">
              <TabsTrigger value="management" className="rounded-xl px-6">
                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Usuários
              </TabsTrigger>
              <TabsTrigger value="analytics" className="rounded-xl px-6">
                <Activity className="mr-2 h-4 w-4" aria-hidden="true" /> Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="management" className="mt-0">
              <div className="glass rounded-3xl p-6 border shadow-sm">
                <UserList />
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="mt-0">
              {activeTab === 'analytics' && (
                <AnalyticsChart
                  title="Tráfego de Artigos"
                  data={stats?.charts?.views_series || []}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar Activity Feed */}
        <aside className="space-y-6">
          <div className="flex items-center justify-between mb-2 px-2">
            <h3 className="font-bold text-lg tracking-tight">Atividade Recente</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary animate-pulse">Live</span>
          </div>
          <div className="max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
            <ActivityTimeline activities={stats?.recent_activity || []} />
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <Protected requiredPermissions={['admin.view_dashboard']}>
        <AdminPageContent />
      </Protected>
    </Suspense>
  )
}
