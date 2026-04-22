"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Users, 
  UserPlus, 
  Activity, 
  Database, 
  ShieldCheck, 
  FileText, 
  Globe, 
  Zap, 
  DollarSign, 
  CreditCard, 
  Target, 
  LineChart 
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import dynamic from "next/dynamic"
import { Protected } from "@/components/auth/protected"
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"

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
  const [activeTab, setActiveTab] = useState<'management' | 'analytics' | 'crm' | 'finance'>('management')

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
    refetchInterval: 60000 // Refresh every minute
  })

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      <PageHeader
        title="Atlas Command Center"
        description="Monitoramento estratégico e orquestração de recursos do ecossistema Atlas."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => window.open('/api/core/sitemap/', '_blank')} className="hidden sm:flex rounded-xl border-border bg-card/50 font-black uppercase tracking-widest text-[10px] h-11">
            <Globe className="mr-2 h-4 w-4" /> SEO Sitemap
          </Button>
          <Button onClick={() => router.push('/admin/users?create=1')} className="shadow-premium rounded-xl font-black uppercase tracking-widest text-[10px] h-11 px-8 w-full sm:w-auto">
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Admissão de Usuário
          </Button>
        </div>
      </PageHeader>

      {/* High Level Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Consumo de Licenças"
          value={stats?.counters?.users?.total ?? 0}
          icon={Users}
          isLoading={statsLoading}
          description="Usuários ativos no tenant atual"
          className="bg-primary/5 border-primary/10"
        />
        <StatsCard
          title="Saúde Financeira"
          value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.counters?.finance?.balance_month ?? 0)}
          icon={DollarSign}
          isLoading={statsLoading}
          description="Saldo líquido da competência atual"
          trend={stats?.counters?.finance?.balance_month > 0 ? {
            value: 12,
            label: "vs mês anterior",
            isPositive: true
          } : undefined}
          className="bg-emerald-500/5 border-emerald-500/10"
        />
        <StatsCard
          title="Velocity CRM"
          value={stats?.counters?.crm?.total_deals ?? 0}
          icon={Zap}
          isLoading={statsLoading}
          description={`${stats?.counters?.crm?.active_swarms ?? 0} War Rooms ativas agora`}
          className="bg-orange-500/5 border-orange-500/10"
        />
        <StatsCard
          title="Uptime SVS"
          value={stats?.system_status?.api_uptime ?? "100%"}
          icon={Activity}
          isLoading={statsLoading}
          description="Service Value System operacional"
          className="bg-blue-500/5 border-blue-500/10"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Main Orchestration Area */}
        <div className="xl:col-span-3 space-y-8">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <TabsList className="bg-muted/30 p-1.5 rounded-[1.5rem] border border-border w-full md:w-auto overflow-x-auto overflow-y-hidden">
                <TabsTrigger value="management" className="rounded-xl px-6 font-black uppercase tracking-widest text-[9px] h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <ShieldCheck className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Gestão de Acesso
                </TabsTrigger>
                <TabsTrigger value="crm" className="rounded-xl px-6 font-black uppercase tracking-widest text-[9px] h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Target className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> CRM Velocity
                </TabsTrigger>
                <TabsTrigger value="finance" className="rounded-xl px-6 font-black uppercase tracking-widest text-[9px] h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <CreditCard className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Financeiro
                </TabsTrigger>
                <TabsTrigger value="analytics" className="rounded-xl px-6 font-black uppercase tracking-widest text-[9px] h-10 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <LineChart className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Analytics SVS
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="management" className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="glass rounded-[2.5rem] p-6 md:p-10 border border-border shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                  <Users className="h-40 w-40" />
                </div>
                <div className="mb-8">
                  <h3 className="text-xl font-black tracking-tighter uppercase mb-1">Relação de Usuários</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">Controle de acesso e provisionamento de identidades.</p>
                </div>
                <UserList />
              </div>
            </TabsContent>

            <TabsContent value="crm" className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="rounded-[2.5rem] border-border bg-card/50 backdrop-blur-xl p-8 shadow-xl">
                  <CardHeader className="p-0 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <Target className="h-6 w-6 text-orange-500" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tighter">Oportunidades Ativas</CardTitle>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Total de cards no Kanban</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="text-5xl font-black tracking-tighter text-orange-500 mb-4">{stats?.counters?.crm?.total_deals ?? 0}</div>
                    <p className="text-sm font-bold text-muted-foreground/60 leading-relaxed uppercase tracking-tighter">
                      Volume total de transações em processamento nos pipelines do tenant.
                    </p>
                  </CardContent>
                </Card>

                <Card className="rounded-[2.5rem] border-border bg-card/50 backdrop-blur-xl p-8 shadow-xl">
                  <CardHeader className="p-0 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                        <Zap className="h-6 w-6 text-rose-500" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-black uppercase tracking-tighter">ITIL v5 Swarming</CardTitle>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Sessões de colaboração ativa</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="text-5xl font-black tracking-tighter text-rose-500 mb-4">{stats?.counters?.crm?.active_swarms ?? 0}</div>
                    <p className="text-sm font-bold text-muted-foreground/60 leading-relaxed uppercase tracking-tighter">
                      Incidentes ou mudanças que requerem mobilização coletiva imediata.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="finance" className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass rounded-[2rem] p-8 border border-emerald-500/10 bg-emerald-500/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2 block">Receita Mensal</span>
                  <div className="text-3xl font-black tracking-tighter text-foreground mb-4">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.counters?.finance?.revenue_month ?? 0)}
                  </div>
                  <Progress value={100} className="h-1.5 bg-emerald-500/10" />
                </div>
                <div className="glass rounded-[2rem] p-8 border border-rose-500/10 bg-rose-500/5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2 block">Despesa Mensal</span>
                  <div className="text-3xl font-black tracking-tighter text-foreground mb-4">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.counters?.finance?.expenses_month ?? 0)}
                  </div>
                  <Progress value={100} className="h-1.5 bg-rose-500/10" />
                </div>
                <div className="glass rounded-[2rem] p-8 border border-primary/20 bg-primary/10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 block">Saldo Operacional</span>
                  <div className="text-3xl font-black tracking-tighter text-foreground mb-4">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats?.counters?.finance?.balance_month ?? 0)}
                  </div>
                  <div className="h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="analytics" className="mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="glass rounded-[2.5rem] p-6 md:p-10 border border-border shadow-2xl">
                <AnalyticsChart
                  title="Fluxo de Valor (Daily Throughput)"
                  data={stats?.charts?.views_series || []}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar Intelligence Feed */}
        <aside className="space-y-8">
          <div className="glass rounded-[2.5rem] p-6 md:p-10 border border-border shadow-xl h-full flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-lg">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <h3 className="font-black text-sm uppercase tracking-tighter">Sinais de Rede</h3>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary animate-pulse">Live Feed</span>
                </div>
              </div>
            </div>
            
            <ScrollArea className="flex-1 -mr-4 pr-4 max-h-[600px]">
              <ActivityTimeline activities={stats?.recent_activity || []} />
            </ScrollArea>
            
            <div className="pt-8 border-t border-border mt-8">
              <Button variant="ghost" onClick={() => router.push('/admin/audit')} className="w-full rounded-2xl h-12 font-black uppercase tracking-widest text-[10px] hover:bg-primary/10 hover:text-primary transition-all">
                Acessar Meta-Logs de Auditoria
              </Button>
            </div>
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
