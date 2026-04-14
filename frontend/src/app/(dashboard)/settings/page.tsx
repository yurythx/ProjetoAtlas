"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building, Settings2, Mail, Webhook, PlugZap } from "lucide-react"
import { PageHeader } from "@/components/ui/page-header"
import { useEffect, useMemo, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Protected } from "@/components/auth/protected"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const CompanyForm = dynamic(
  () => import("@/features/settings/company-form").then((m) => m.CompanyForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando configurações da empresa">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
    ),
  }
)

const BrandingSettings = dynamic(
  () => import("@/components/settings/branding-settings").then((m) => m.BrandingSettings),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando configurações de marca">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    ),
  }
)

const SmtpSettings = dynamic(
  () => import("@/features/settings/smtp-settings").then((m) => m.SmtpSettings),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando configurações de e-mail">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
    ),
  }
)

const WebhookSettings = dynamic(
  () => import("@/features/webhooks/webhook-settings").then((m) => m.WebhookSettings),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    ),
  }
)

const IntegrationSettings = dynamic(
  () => import("@/features/integrations/integration-settings").then((m) => m.IntegrationSettings),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    ),
  }
)

function SettingsContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const tabParam = searchParams.get("tab")
    const allowedTabs = useMemo(() => new Set(["company", "branding", "email", "webhooks", "integrations"]), [])
    const [activeTab, setActiveTab] = useState("company")

  useEffect(() => {
    if (tabParam === "profile") {
      router.replace("/perfil")
      return
    }
    if (tabParam && allowedTabs.has(tabParam)) {
      setActiveTab(tabParam)
      return
    }
    setActiveTab("company")
  }, [router, tabParam, allowedTabs])

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <PageHeader
        title="Configurações do Sistema"
        description="Gerencie as configurações da organização e preferências globais."
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value)
          router.replace(`/settings?tab=${encodeURIComponent(value)}`)
        }}
        className="space-y-8"
      >
        <div className="glass rounded-2xl p-2 border shadow-sm">
          <TabsList className="bg-transparent p-0 w-full flex flex-col md:flex-row h-auto gap-2" aria-label="Seções de configurações">
            <TabsTrigger
              value="company"
              className="w-full md:flex-1 justify-start md:justify-center gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all font-medium"
            >
              <Building className="h-4 w-4" aria-hidden="true" />
              Empresa
            </TabsTrigger>

            <TabsTrigger
              value="branding"
              className="w-full md:flex-1 justify-start md:justify-center gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all font-medium"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Marca
            </TabsTrigger>

            <TabsTrigger
              value="email"
              className="w-full md:flex-1 justify-start md:justify-center gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all font-medium"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              E-mail
            </TabsTrigger>

            <Protected requireStaff>
              <TabsTrigger
                value="webhooks"
                className="w-full md:flex-1 justify-start md:justify-center gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all font-medium"
              >
                <Webhook className="h-4 w-4" aria-hidden="true" />
                Webhooks
              </TabsTrigger>
            </Protected>

            <Protected requireStaff>
              <TabsTrigger
                value="integrations"
                className="w-full md:flex-1 justify-start md:justify-center gap-3 px-4 py-3 rounded-xl data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all font-medium"
              >
                <PlugZap className="h-4 w-4" aria-hidden="true" />
                Integrações
              </TabsTrigger>
            </Protected>
          </TabsList>
        </div>

        <div
          key={activeTab}
          className="glass rounded-3xl p-6 md:p-10 border shadow-sm outline-none animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
            <Protected requireStaff>
              {activeTab === "company" && <CompanyForm />}
              {activeTab === "branding" && <BrandingSettings isOnboarding={false} />}
              {activeTab === "email" && <SmtpSettings isOnboarding={false} />}
              {activeTab === "webhooks" && <WebhookSettings />}
              {activeTab === "integrations" && <IntegrationSettings />}
            </Protected>
        </div>
      </Tabs>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div role="status" aria-live="polite" aria-label="Carregando configurações">Carregando...</div>}>
      <Protected>
        <SettingsContent />
      </Protected>
    </Suspense>
  )
}
