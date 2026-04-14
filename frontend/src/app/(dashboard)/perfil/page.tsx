"use client"

import { PageHeader } from "@/components/ui/page-header"
import { Suspense } from "react"
import { Protected } from "@/components/auth/protected"
import { Palette, User, Bell, Calendar as CalendarIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

const ProfileForm = dynamic(
  () => import("@/features/settings/profile-form").then((m) => m.ProfileForm),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando formulário de perfil">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
    ),
  }
)

const UserThemeSelector = dynamic(
  () => import("@/components/settings/user-theme-selector").then((m) => m.UserThemeSelector),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando preferências de tema">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>
    ),
  }
)

const UserNotificationPreferences = dynamic(
  () => import("@/components/settings/user-notification-preferences").then((m) => m.UserNotificationPreferences),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando preferências de notificações">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    ),
  }
)

const GoogleCalendarSync = dynamic(
  () => import("@/features/calendar/google-calendar-sync").then((m) => m.GoogleCalendarSync),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    ),
  }
)

function ProfileContent() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <PageHeader
        title="Meu Perfil"
        description="Gerencie suas informações pessoais e preferências de conta."
      />

      <div className="grid gap-8">
        <div className="glass rounded-3xl p-6 md:p-10 border shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-6 text-primary">
            <User className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Informações Pessoais</h2>
          </div>
          <ProfileForm />
        </div>

        <div className="glass rounded-3xl p-6 md:p-10 border shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-2 text-primary">
            <Palette className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Aparência & Tema</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Personalize como você vê a plataforma. Essas configurações afetam apenas o seu usuário.
          </p>
          
          <UserThemeSelector />
        </div>

        <div className="glass rounded-3xl p-6 md:p-10 border shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-2 text-primary">
            <Bell className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Notificações</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Ajuste quais eventos geram notificações para o seu usuário.
          </p>
          <UserNotificationPreferences />
        </div>

        <div className="glass rounded-3xl p-6 md:p-10 border shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 mb-2 text-primary">
            <CalendarIcon className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Integrações de Agenda</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Conecte seu calendário externo para sincronização bidirecional de eventos.
          </p>
          <GoogleCalendarSync />
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando perfil...</div>}>
      <Protected>
        <ProfileContent />
      </Protected>
    </Suspense>
  )
}
