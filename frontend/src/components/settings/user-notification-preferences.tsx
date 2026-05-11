"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { H3, P } from "@/components/ui/typography"
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react"
import { usePushSubscription } from "@/hooks/use-push-subscription"

type UserNotificationPreference = {
  notify_moderation_comment_pending: boolean
  notify_moderation_reply_pending: boolean
  notify_moderation_article_pending: boolean
  notify_reply_approved_single: boolean
  notify_reply_approved_thread: boolean
}

function PushNotificationToggle() {
  const { status, toggle, isPending, subscribeError, unsubscribeError } = usePushSubscription()

  React.useEffect(() => {
    if (subscribeError) toast.error((subscribeError as Error).message || "Erro ao ativar notificações push.")
    if (unsubscribeError) toast.error("Erro ao desativar notificações push.")
  }, [subscribeError, unsubscribeError])

  if (status === "unsupported") {
    return (
      <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4 opacity-50">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2">
            <BellOff className="h-4 w-4" />
            Notificações push
          </div>
          <div className="text-sm text-muted-foreground">
            Não suportado neste navegador.
          </div>
        </div>
      </div>
    )
  }

  const statusLabel: Record<typeof status, string> = {
    loading: "Verificando...",
    subscribed: "Ativadas neste dispositivo",
    unsubscribed: "Desativadas",
    denied: "Bloqueadas pelo navegador",
    unsupported: "",
  }

  const StatusIcon = status === "subscribed" ? BellRing : status === "denied" ? BellOff : Bell

  return (
    <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4">
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-2">
          <StatusIcon className="h-4 w-4" />
          Notificações push
        </div>
        <div className="text-sm text-muted-foreground">{statusLabel[status]}</div>
        {status === "denied" && (
          <div className="text-xs text-amber-500 mt-1">
            Habilite permissões de notificação nas configurações do navegador.
          </div>
        )}
      </div>
      {status !== "denied" && status !== "unsupported" && (
        <Button
          size="sm"
          variant={status === "subscribed" ? "outline" : "default"}
          className="shrink-0 rounded-xl"
          disabled={isPending || status === "loading"}
          onClick={toggle}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === "subscribed" ? (
            "Desativar"
          ) : (
            "Ativar"
          )}
        </Button>
      )}
    </div>
  )
}

export function UserNotificationPreferences() {
  const queryClient = useQueryClient()

  const prefQuery = useQuery({
    queryKey: ["accounts", "preferences", "notifications", "current"],
    queryFn: async () => {
      const res = await api.get<UserNotificationPreference>("/api/accounts/preferences/notifications/current/")
      return res.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (partial: Partial<UserNotificationPreference>) => {
      const res = await api.patch<UserNotificationPreference>(
        "/api/accounts/preferences/notifications/update_current/",
        partial
      )
      return res.data
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["accounts", "preferences", "notifications", "current"], data)
      toast.success("Preferências de notificações atualizadas")
    },
    onError: () => {
      toast.error("Falha ao atualizar preferências de notificações")
    },
  })

  const data = prefQuery.data

  if (prefQuery.isLoading) {
    return <div role="status" aria-live="polite">Carregando preferências...</div>
  }

  if (!data) {
    return <div className="text-sm text-muted-foreground">Não foi possível carregar preferências.</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <H3>Notificações</H3>
        <P className="text-muted-foreground mt-1">
          Controle quais eventos geram notificações para você.
        </P>
      </div>

      <PushNotificationToggle />

      <div className="space-y-4">
        <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4">
          <div className="min-w-0">
            <div className="font-medium">Artigos pendentes</div>
            <div className="text-sm text-muted-foreground">
              Notificar quando houver artigos pendentes de aprovação.
            </div>
          </div>
          <Switch
            checked={data.notify_moderation_article_pending}
            onCheckedChange={(checked) => updateMutation.mutate({ notify_moderation_article_pending: checked })}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4">
          <div className="min-w-0">
            <div className="font-medium">Comentários pendentes</div>
            <div className="text-sm text-muted-foreground">
              Notificar quando houver comentários pendentes de aprovação.
            </div>
          </div>
          <Switch
            checked={data.notify_moderation_comment_pending}
            onCheckedChange={(checked) => updateMutation.mutate({ notify_moderation_comment_pending: checked })}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4">
          <div className="min-w-0">
            <div className="font-medium">Respostas pendentes</div>
            <div className="text-sm text-muted-foreground">
              Notificar quando houver respostas pendentes de aprovação.
            </div>
          </div>
          <Switch
            checked={data.notify_moderation_reply_pending}
            onCheckedChange={(checked) => updateMutation.mutate({ notify_moderation_reply_pending: checked })}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4">
          <div className="min-w-0">
            <div className="font-medium">Resposta aprovada (individual)</div>
            <div className="text-sm text-muted-foreground">
              Notificar quando uma resposta ao seu comentário for aprovada.
            </div>
          </div>
          <Switch
            checked={data.notify_reply_approved_single}
            onCheckedChange={(checked) => updateMutation.mutate({ notify_reply_approved_single: checked })}
            disabled={updateMutation.isPending}
          />
        </div>

        <div className="flex items-start justify-between gap-6 rounded-2xl border border-border/50 bg-muted/20 p-4">
          <div className="min-w-0">
            <div className="font-medium">Respostas aprovadas (thread)</div>
            <div className="text-sm text-muted-foreground">
              Notificar quando várias replies forem aprovadas na sua thread.
            </div>
          </div>
          <Switch
            checked={data.notify_reply_approved_thread}
            onCheckedChange={(checked) => updateMutation.mutate({ notify_reply_approved_thread: checked })}
            disabled={updateMutation.isPending}
          />
        </div>
      </div>
    </div>
  )
}
