"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Users, FileText, MessageSquare, Zap, Layout, Code } from "lucide-react"
import { H2, P } from "@/components/ui/typography"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Company } from "@/types"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { useModules } from "@/hooks/use-modules"

const DjangoHero = dynamic(
  () => import("@/components/dashboard/django-hero").then((m) => m.DjangoHero),
  {
    ssr: false,
    loading: () => (
      <div className="-mx-8 -mt-8">
        <div className="h-[400px] w-full bg-muted/20 animate-pulse flex flex-col justify-center px-12 space-y-6 border-b">
          <div className="space-y-3">
            <Skeleton className="h-14 w-[60%] rounded-2xl" />
            <Skeleton className="h-6 w-[40%] rounded-xl" />
          </div>
          <div className="flex gap-4 pt-4">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-40 rounded-full" />
          </div>
        </div>
      </div>
    ),
  }
)

const AnalyticsChart = dynamic(
  () => import("@/components/dashboard/analytics-chart").then((m) => m.AnalyticsChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] rounded-2xl border border-primary/5 bg-card/30 p-8 flex flex-col space-y-6" role="status" aria-live="polite" aria-label="Carregando analytics">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <Skeleton className="flex-1 w-full rounded-xl" />
      </div>
    ),
  }
)

const OnboardingWizard = dynamic(
  () => import("@/features/onboarding/onboarding-wizard").then((m) => m.OnboardingWizard),
  { ssr: false }
)

export default function DashboardPage() {
  const { isModuleActive } = useModules()
  const companySlug = typeof window !== 'undefined' ? localStorage.getItem('companySlug') : null
  const envCompany = process.env.NEXT_PUBLIC_COMPANY_SLUG
  const effectiveCompany = companySlug || envCompany || 'unknown'

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', effectiveCompany],
    queryFn: async () => {
      const res = await api.get('/api/core/dashboard/stats/')
      return res.data
    }
  })

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['current-company', effectiveCompany],
    queryFn: async () => {
      const res = await api.get<Company>('/api/core/companies/current/')
      return res.data
    }
  })

  if (statsLoading || companyLoading) {
    return (
      <div className="space-y-12 pb-20" role="status" aria-live="polite" aria-label="Carregando dashboard">
        <div className="-mx-8 -mt-8">
          <div className="h-[400px] w-full bg-muted/20 animate-pulse flex flex-col justify-center px-12 space-y-6 border-b">
            <div className="space-y-3">
              <Skeleton className="h-14 w-[60%] rounded-2xl" />
              <Skeleton className="h-6 w-[40%] rounded-xl" />
            </div>
            <div className="flex gap-4 pt-4">
              <Skeleton className="h-12 w-40 rounded-full" />
              <Skeleton className="h-12 w-40 rounded-full" />
            </div>
          </div>
        </div>

        <div className="container mx-auto px-6 space-y-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-primary/5 bg-card/30 p-5 space-y-3">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-12 pb-20">
      {!company?.onboarding_completed && <OnboardingWizard />}

      {/* Hero Section - The "WOW" factor */}
      <div className="-mx-8 -mt-8">
        <DjangoHero
          title={`Bem-vindo ao ${stats?.counters?.users?.total > 0 ? 'seu' : ''} Atlas`}
          subtitle="Sua central de inteligência para gestão de conteúdo, comunicação e crescimento escalável."
          ctaText={isModuleActive('articles') ? "Publicar Artigo" : "Ver Perfil"}
          ctaHref={isModuleActive('articles') ? "/artigos" : "/perfil"}
          secondaryCtaText="Ver Analytics"
          secondaryCtaHref="#analytics-section"
        />
      </div>

      <div className="container mx-auto px-6 space-y-16">

        {/* Quick Stats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.08s" }}>
            <StatItem
              title="Usuários Ativos"
              value={stats?.counters?.users?.total || 0}
              growth={stats?.counters?.users?.growth}
              icon={Users}
            />
          </div>
          {isModuleActive('articles') && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.12s" }}>
              <StatItem
                title="Conteúdo Publicado"
                value={stats?.counters?.articles?.total || 0}
                growth={stats?.counters?.articles?.growth}
                icon={FileText}
              />
            </div>
          )}
          {isModuleActive('messenger') && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.16s" }}>
              <StatItem
                title="Mensagens Trocadas"
                value={stats?.counters?.messages?.total || 0}
                growth={stats?.counters?.messages?.growth}
                icon={MessageSquare}
              />
            </div>
          )}
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.20s" }}>
            <StatItem
              title="Status do Sistema"
              value={stats?.system_status?.api_uptime || "Online"}
              label="API Uptime"
              icon={Zap}
              isStatus
              statusColor={stats?.system_status?.api_uptime ? "text-green-500" : "text-red-500"}
            />
          </div>
        </section>

        {/* Analytics Section */}
        <section id="analytics-section" className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.22s" }}>
            <AnalyticsChart
              data={stats?.charts?.views_series || []}
              title="Tráfego de Conteúdo (30d)"
              isLoading={statsLoading}
            />
          </div>
          <div className="space-y-6">
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.26s" }}>
              <div className="p-6 rounded-2xl border bg-card shadow-sm">
                <h3 className="text-sm font-bold text-primary uppercase tracking-widest mb-4">Módulos Ativos</h3>
                <div className="space-y-3">
                  <ActiveModule title="CMS" status="Active" icon={Layout} />
                  <ActiveModule title="Artigos" status="Active" icon={FileText} />
                  <ActiveModule title="Messenger" status="Active" icon={MessageSquare} />
                  <ActiveModule title="API Hub" status="Stable" icon={Code} />
                </div>
              </div>
            </div>
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.30s" }}>
              <div className="p-6 rounded-2xl border bg-background/90 shadow-inner">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2 text-center">Armazenamento</h3>
                <div className="text-2xl font-bold text-center text-foreground">{stats?.system_status?.storage_used || "1.2GB"}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Main Content Split: Activity vs Categories */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
          {/* Recent Activity */}
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.34s" }}>
            <div className="flex items-center justify-between">
              <H2 className="border-none text-2xl font-bold">Atividade Recente</H2>
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80" asChild>
                <Link href="/admin/audit">Ver todas</Link>
              </Button>
            </div>
            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              <div className="divide-y divide-border/50">
                {(stats?.recent_activity || []).map((log: { action: string; resource: string; user?: { name?: string } | null; created_at: string }, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="h-2 w-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          <span className="text-primary font-bold">{String(log.action).toUpperCase()}</span>
                          <span className="text-muted-foreground">•</span>
                          <span>{log.resource}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Realizado por <span className="text-foreground font-semibold">{log.user?.name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                {(!stats?.recent_activity || stats.recent_activity.length === 0) && (
                  <div className="p-12 text-center text-muted-foreground">Nenhuma atividade detectada nas últimas 24h.</div>
                )}
              </div>
            </div>
          </div>

          {/* Popular Categories */}
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "0.38s" }}>
            <H2 className="border-none text-2xl font-bold">Distribuição de Conteúdo</H2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(stats?.charts?.categories || []).map((cat: { name: string; article_count: number }, i: number) => (
                <div key={i} className="p-4 rounded-xl border bg-background hover:border-primary/30 transition-all flex items-center justify-between group">
                  <div>
                    <div className="text-xs font-bold text-muted-foreground uppercase mb-1">{cat.name}</div>
                    <div className="text-2xl font-bold text-foreground">{cat.article_count}</div>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-primary/5 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatItemProps {
  title: string
  value: number | string
  growth?: number
  icon: React.ComponentType<{ size?: number }>
  isStatus?: boolean
  label?: string
  statusColor?: string
}
function StatItem({ title, value, growth, icon: Icon, isStatus, label, statusColor }: StatItemProps) {
  return (
    <Card className="glass-card relative overflow-hidden group hover:shadow-lg transition-all duration-500 border-border/50">
      <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity" aria-hidden="true">
        <Icon size={80} />
      </div>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">{title}</CardDescription>
        <CardTitle className={cn("text-4xl font-black tracking-tight flex items-baseline gap-2", statusColor)}>
            {isStatus && (
                <span className={cn("inline-block w-4 h-4 rounded-full mr-2", value === "Online" || value === "100%" ? "bg-green-500 animate-pulse" : "bg-red-500")} aria-hidden="true" />
            )}
          {value}
          {growth !== undefined && (
            <span className={cn(
              "text-xs font-bold px-1.5 py-0.5 rounded-md text-foreground",
              growth >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>
              {growth >= 0 ? '+' : ''}{growth}%
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <P className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-0">
          {isStatus ? label : "Referência ao mês anterior"}
        </P>
      </CardContent>
    </Card>
  )
}

interface ActiveModuleProps {
  title: string
  status: string
  icon: React.ComponentType<{ className?: string }>
}
function ActiveModule({ title, status, icon: Icon }: ActiveModuleProps) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-foreground/5 flex items-center justify-center" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary">{status}</span>
    </div>
  )
}

