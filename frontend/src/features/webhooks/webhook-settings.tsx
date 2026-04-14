"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/axios"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, Activity, CheckCircle2, XCircle } from "lucide-react"
import { usePermission } from "@/hooks/use-permission"

interface WebhookDelivery {
  id: number
  event_name: string
  status_code: number | null
  success: boolean
  request_payload: unknown
  response_body: string | null
  attempt_number: number
  created_at: string
}

interface WebhookSubscription {
  id: number
  url: string
  is_active: boolean
  events: string[]
}

export function WebhookSettings() {
  const { hasPermission } = usePermission()
  const canManageWebhooks = hasPermission("settings.webhooks_manage")

  const { data: subscriptions, isLoading, isError } = useQuery<WebhookSubscription[]>({
    queryKey: ['webhook-subscriptions'],
    queryFn: async () => {
      const res = await api.get('/api/webhooks/subscriptions/')
      return res.data
    },
    enabled: canManageWebhooks,
    retry: false,
  })

  if (isLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Endpoints Configurados</CardTitle>
          <CardDescription>
            Aqui estão os webhooks cadastrados para a sua empresa. (A criação de novos webhooks está em desenvolvimento).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canManageWebhooks ? (
            <div className="text-center p-8 text-muted-foreground border rounded-lg">
              Sem permissão para visualizar webhooks.
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (typeof window === "undefined") return
                    window.dispatchEvent(
                      new CustomEvent("app-unauthorized", {
                        detail: { message: "Você não possui autorização para gerenciar webhooks. Conceda a permissão settings.webhooks_manage." },
                      })
                    )
                  }}
                >
                  Ver detalhes
                </Button>
              </div>
            </div>
          ) : isError ? (
            <div className="text-center p-8 text-muted-foreground border rounded-lg">
              Não foi possível carregar os webhooks.
            </div>
          ) : !subscriptions?.length ? (
            <div className="text-center p-8 text-muted-foreground border rounded-lg">
              Nenhum webhook configurado.
            </div>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <WebhookDeliveryLogs key={sub.id} subscription={sub} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function WebhookDeliveryLogs({ subscription }: { subscription: WebhookSubscription }) {
  const [isOpen, setIsOpen] = useState(false)

  const { data: deliveries, isLoading } = useQuery<WebhookDelivery[]>({
    queryKey: ['webhook-deliveries', subscription.id],
    queryFn: async () => {
      const res = await api.get(`/api/webhooks/subscriptions/${subscription.id}/deliveries/`)
      return res.data
    },
    enabled: isOpen,
    retry: false,
  })

  return (
    <div className="border rounded-lg overflow-hidden">
      <div 
        className="p-4 bg-muted/30 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div>
          <div className="font-medium flex items-center gap-2">
            {subscription.url}
            <Badge variant={subscription.is_active ? "default" : "secondary"}>
              {subscription.is_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Eventos: {(subscription.events || []).join(", ")}
          </div>
        </div>
        <Activity className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="p-4 border-t bg-background">
          <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Últimos Envios (Logs)</h4>
          
          {isLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !deliveries?.length ? (
            <div className="text-sm text-muted-foreground text-center py-4">Nenhum envio registrado ainda.</div>
          ) : (
            <div className="space-y-3">
              {deliveries.map(delivery => (
                <div key={delivery.id} className="text-sm border rounded p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {delivery.success ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <span className="font-medium">{delivery.event_name}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {format(new Date(delivery.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">Status HTTP: <strong className={delivery.success ? 'text-green-500' : 'text-destructive'}>{delivery.status_code || 'Falha de Rede'}</strong></span>
                    <span className="text-muted-foreground">Tentativa: <strong>{delivery.attempt_number}</strong></span>
                  </div>

                  {!delivery.success && delivery.response_body && (
                    <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded text-xs overflow-x-auto">
                      {delivery.response_body}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
