# Módulo Notifications — Guia Completo

Este documento descreve arquitetura, modelos, endpoints REST, WebSockets, Web Push, integrações de frontend, requisitos de segurança e melhores práticas do módulo Notifications.


## Visão Geral

- Notificações internas em tempo real (WebSocket) e via Web Push.
- Gatilhos automáticos por signals (mensagens no Messenger e publicação de Artigos).
- Ações básicas: listar, marcar como lidas (individual ou todas).
- Assinaturas Push por navegador/dispositivo com VAPID (p256dh/auth).


## Arquitetura

- Back-end (Django/DRF + Channels + Celery)
  - REST: listar/ler notificações; gerenciar assinaturas de push por usuário/tenant.
  - WebSocket: canal por usuário para eventos em tempo real.
  - Tarefas: envio de Web Push assíncrono (pywebpush) com VAPID.
  - Signals: criação de Notification a partir de eventos (chat e artigos).

- Front-end (Next.js/React)
  - Hook único para WebSocket de notificações com dedupe de toasts.
  - Componente de campainha com lista e contagem de não lidas.
  - Service Worker para exibir Web Push e deep-link.
  - Manager para inscrição Push com VAPID.


## Modelos (Back-end)

- Notification
  - recipient, notification_type ('message'|'system'|'approval'), title, message, link, is_read, created_at
  - Index por (recipient, is_read)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/models.py#L1-L35)

- PushSubscription
  - user, endpoint, p256dh, auth, browser, device, is_active, timestamps
  - Útil para envio Web Push por dispositivo
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/models.py#L37-L63)


## API REST

Base: `/api/notifications/`

- Notificações `/notifications/`
  - GET: lista 50 mais recentes; sem paginação formal na resposta (limit aplicado no list). [views.py:list](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py#L18-L23)
  - POST: bloqueado (criação só por signals/tasks). [views.py:create](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py#L25-L33)
  - POST `/notifications/{id}/mark_as_read/`: marcar como lida. [views.py:mark_as_read](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py#L35-L41)
  - POST `/notifications/mark_all_as_read/`: marcar todas como lidas. [views.py:mark_all_as_read](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py#L27-L33)

- Assinaturas Push `/push-subscriptions/`
  - GET: lista assinaturas do usuário/tenant atual (sem paginação). [views.py:get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py#L47-L54)
  - POST: cria/associa assinatura com user+company. [views.py:perform_create](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py#L56-L61)

URLs: [urls.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/urls.py)


## WebSockets

- Rota: `ws://<host>/ws/notifications/?token=<JWT>&company_slug=<slug>`
  - Autenticação via query param (JWT) e contexto de tenant por company_slug.
  - Sala por usuário: `notifications_user_{user.id}`.
  - Consumer: [consumers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/consumers.py)
  - Roteamento agregado no ASGI: [config/asgi.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/config/asgi.py#L1-L21)

- Evento entregue ao cliente:
  ```json
  {
    "type": "notification_message",
    "notification_id": "uuid|id",
    "notification_type": "message|system|approval",
    "title": "string",
    "message": "string",
    "link": "/destino",
    "conversation_id": 123,             // quando aplicável (chat)
    "message_id": 456,                  // quando aplicável (chat)
    "message_created_at": "ISO-8601",   // quando aplicável
    "created_at": "ISO-8601"
  }
  ```


## Web Push (VAPID)

- Envio assíncrono (Celery) com `pywebpush`. [tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/tasks.py)
  - Task `send_push_notification(subscription_id, title, message, link)`
  - Utilitário `notify_user_push(user, ...)` itera sobre assinaturas ativas do usuário.
  - Chaves VAPID no back: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_ADMIN_EMAIL` (settings.py).

- Front-end
  - Registro do Service Worker e subscrição Push com VAPID. [PushNotificationManager.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/notifications/PushNotificationManager.tsx)
  - SW exibe notificação e abre link no clique. [public/sw.js](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/public/sw.js)


## Exemplos de API (cURL)

- Listar notificações e marcar como lidas:

```bash
curl "$API/api/notifications/notifications/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"

curl -X POST "$API/api/notifications/notifications/42/mark_as_read/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"

curl -X POST "$API/api/notifications/notifications/mark_all_as_read/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```

- Registrar assinatura Web Push (após obter subscription no browser):

```bash
curl -X POST "$API/api/notifications/push-subscriptions/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"<endpoint>","p256dh":"<p256dh>","auth":"<auth>","browser":"Chrome","device":"Windows"}'
```


## Signals e Gatilhos

- Nova mensagem (Messenger) → cria Notification e envia WS para destinatários (exceto o remetente). [signals.py:notify_new_message](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/signals.py#L1-L46)
- Artigo publicado (Articles) → notifica autor (approval) via WS (e pode haver Web Push pelo fluxo de publish do módulo Articles). [signals.py:notify_article_status](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/signals.py#L48-L100)


## Diagramas de Fluxo

- Notificação em Tempo Real (WS)
```
Evento (ex.: chat) -> Signal -> cria Notification ----> Channels -> group_send
Client (usuario alvo) ---------------------------------> WS notification_message
```

- Web Push (VAPID)
```
Evento -> Task notify_user_push -> send_push_notification (pywebpush) -> Browser Push Service
Service Worker (sw.js) recebe 'push' -> showNotification -> 'notificationclick' -> openWindow(link)
```


## Integração Front-end

- WebSocket singleton de notificações (reconexão com backoff, dedupe de toasts e respeito a conversas abertas). [use-notifications-v2.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-notifications-v2.ts)
- Campainha com contagem e lista. [notification-bell.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/notification-bell.tsx)
- Página dedicada no dashboard. [notificacoes/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/notificacoes/page.tsx)
- Service Worker para Push. [public/sw.js](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/public/sw.js)
- Registro do SW e prompt de inscrição quando possível. [providers.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/providers.tsx)


## Segurança, Multi-tenant e Boas Práticas

- Isolamento por tenant: assinaturas (user+company) e WS por usuário autenticado.
- Não permitir criar Notification via API pública (apenas signals/tasks).
- Tratar 410 Gone em Web Push (assinatura inválida → marcar inativa).
- No SW, tratar payloads malformados e pushsubscriptionchange (melhoria recomendada).


## Variáveis de Ambiente

- Back-end
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_ADMIN_EMAIL`
  - `REDIS_URL` (Channels/Celery)
  - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ALLOWED_HOSTS`

- Front-end
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_COMPANY_SLUG`
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`


## Erros Comuns e Solução

- WS não conecta
  - Garantir `?token` válido e `company_slug` presentes; revisar CSP CONNECT_SRC.

- Push 410 Gone
  - A assinatura expirou; endpoint marca como inativa automaticamente. O usuário deve se reinscrever.

- Toasts repetidos
  - O hook possui dedupe por chave/TTL; evitar múltiplos sockets e checar chave de dedupe.

- Notificações em conversa aberta
  - O hook evita toasts quando a conversa correspondente está aberta — comportamento esperado.

- Sem som no push
  - Web Push não garante som padrão; considerar UX no app (toasts e sons locais).

- WS fecha com erro de autenticação
  - Verifique `token` e `company_slug` na URL do WS; confirmar validade do JWT.

- Push não chega
  - Checar configuração VAPID (front/back), existência de assinaturas ativas e execução do worker Celery.

- Duplicidade de toasts
  - use-notifications-v2 incorpora dedupe por chave; certifique-se de não abrir múltiplos sockets.


## Checklist de Configuração

- Back-end
  - VAPID keys (pública/privada/admin email).
  - Redis/Channels configurados (recomendado) e Celery worker.
  - CSP CONNECT_SRC inclui `ws:`/`wss:`.

- Front-end
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` configurada.
  - Registro do SW (`/sw.js`) habilitado.


## Referências de Código

- Models: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/models.py)
- Views/URLs: [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/views.py), [urls.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/urls.py)
- WS: [consumers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/consumers.py), [routing agregado](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/config/asgi.py#L1-L21)
- Tasks: [tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/tasks.py)
- Signals: [signals.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/signals.py)
- Front-end: [use-notifications-v2.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-notifications-v2.ts), [notification-bell.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/notification-bell.tsx), [notificacoes/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/notificacoes/page.tsx), [PushNotificationManager.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/notifications/PushNotificationManager.tsx), [public/sw.js](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/public/sw.js)


---

Documento de referência para manutenção e evolução do módulo de Notificações.
