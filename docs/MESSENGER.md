# Módulo Messenger — Guia Completo

Este documento descreve arquitetura, modelos, endpoints, eventos WebSocket, integrações de frontend, notificações, requisitos de segurança e melhores práticas do módulo Messenger.


## Visão Geral

- Chat em tempo real com:
  - Conversas 1:1 e grupos.
  - Mensagens com texto ou anexos.
  - Resposta a mensagens (thread leve), edição e exclusão suave (soft delete).
  - Reações com emojis e recibos de leitura.
  - Indicador de digitação e presença (online/offline).
  - Notificações via WebSocket e Web Push.
- Multi-tenant por empresa (BaseTenantModel) e verificação de acesso por módulo (RBAC).


## Arquitetura

- Back-end (Django/DRF + Channels + Celery)
  - REST: criação de conversas, listagem/envio de mensagens, reações, leitura, preferências (mute/pin) e prévia de links.
  - WebSockets (Channels): salas por conversa e por presença (empresa); sala de notificações por usuário.
  - Tarefas (Celery): prévia de links e envio de Web Push.
  - Multi-tenant: escopo de empresa em modelos/queries, cabeçalho X-Company-Slug no REST, parâmetro company_slug nos WS.

- Front-end (Next.js/React)
  - UI com ContactList e ChatWindow.
  - Hooks: use-chat (WS chat), use-presence (WS presença), use-notifications-v2 (WS notificações).
  - React Query para histórico e dados relacionais.
  - Service Worker para Web Push (sw.js) e componente de inscrição (PushNotificationManager).


## Modelos de Dados (Back-end)

- Conversation
  - participants: ManyToMany(User)
  - created_at, updated_at
  - title (grupo), is_group
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/models.py#L14-L35)

- Message
  - conversation, sender, content (opcional)
  - Anexos: file, file_name, file_type, file_size
  - created_at, is_read, edited_at
  - Soft delete: is_deleted (mantém integridade do histórico)
  - reply_to: referência à mensagem original
  - Managers: objects (exclui deletados), all_objects (inclui deletados)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/models.py#L36-L101)

- MessageReaction
  - message, user, emoji, created_at
  - unique_together (message, user, emoji)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/models.py#L103-L120)

- ConversationPreference
  - user, conversation, is_muted, is_pinned
  - unique_together (user, conversation)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/models.py#L122-L150)


## API REST (Back-end)

Base: `/api/messenger/`

- Contatos `/contacts/` (GET)
  - Lista contatos visíveis ao usuário (empresa/grupos). Inclui is_online, avatar_url e last_seen.
  - View: [ContactViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L25-L47)

- Conversas `/conversations/`
  - GET: lista conversas do usuário, com `unread_count` anotado. [get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L80-L100)
  - POST: cria conversa 1:1 ou grupo. Campos: `participant_usernames[]`, `title`, `is_group`. [create](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L61-L79)
  - GET `/conversations/find_by_participant/?username=...`: retorna conversa 1:1 se existir. [find_by_participant](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L102-L127)
  - POST `/conversations/{id}/add_participant/` e `/remove_participant/` (somente grupos). [actions](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L129-L155)
  - Preferências por conversa: 
    - POST `/conversations/{id}/mute/` e `/unmute/`
    - POST `/conversations/{id}/pin/` e `/unpin/`
    - POST `/conversations/{id}/mark_all_read/`
    - [ações](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L188-L230)
  - Histórico: GET `/conversations/{id}/messages/?before=<ISO>`
    - Ordena do mais antigo ao mais novo na resposta, usando paginação DRF e âncora `before` (timestamp). [messages](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L247-L288)
  - Busca Global: GET `/conversations/search/?q=texto`. [search](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L200-L217)
  - Envio de mensagem: POST `/conversations/{id}/send_message/` (FormData: `content?`, `file?`, `reply_to_id?`). [send_message](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L219-L246)

- Mensagens `/messages/`
  - PATCH `/messages/{id}/`: editar conteúdo (apenas autor). [perform_update](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L328-L343)
  - DELETE `/messages/{id}/`: exclusão suave (apenas autor). [perform_destroy](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L315-L327)
  - POST `/messages/{id}/reaction/`: `{ emoji, action: 'add'|'remove' }`. [reaction](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L392-L414)
  - POST `/messages/{id}/mark_read/`: marca como lida (apenas destinatário). [mark_read](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L415-L437)
  - GET `/messages/link_preview/?url=...`: prévia de links com sanitização e throttle. [link_preview](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L344-L391)


## WebSockets (Back-end)

- Roteamento:
  - Chat por conversa: `ws://<host>/ws/chat/<conversation_id>/?token=<JWT>&company_slug=<slug>`
  - Presença por empresa: `ws://<host>/ws/presence/?token=<JWT>&company_slug=<slug>`
  - Notificações por usuário: `ws://<host>/ws/notifications/?token=<JWT>&company_slug=<slug>`
  - Código: [messenger/routing.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/routing.py) • [notifications/routing.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/routing.py) • [asgi.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/config/asgi.py#L1-L21)

- Autenticação no WS:
  - Query param `token` (JWT de acesso) e `company_slug` (por limitações do handshake de browsers).
  - Middleware: `JwtAuthMiddleware` (injeta `scope['user']`).

- Eventos recebidos pelo cliente (ChatConsumer):
  - `message`: nova mensagem (texto/anexo/resposta).
  - `typing`: indicador de digitação.
  - `reaction`: reações adicionadas/removidas.
  - `read_receipt`: recibo de leitura.
  - `delete_message`: exclusão suave.
  - `edit_message`: edição de conteúdo.
  - Código: [consumers.py:ChatConsumer](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/consumers.py#L163-L219)

- Eventos enviados pelo cliente (ChatConsumer):
  - `typing_status` `{ is_typing: boolean }`.
  - Observaçao: envio de mensagens é pelo REST (`send_message`), não via WS.
  - Rate limit WS: 10 frames/segundo por usuário. Implementado de forma atômica usando Redis `INCR` (DB 2). [consumidor](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/consumers.py#L164-L183)

- Presença (PresenceConsumer):
  - Broadcast `presence_update` `{ user_id, username, status: 'online'|'offline' }` por empresa.
  - Heartbeat: O front-end envia um evento `heartbeat` a cada 30s para manter o status no Redis (TTL de 60s). Isso resolve desconexões "sujas".
  - Guarda `last_seen` ao desconectar no banco de dados. [PresenceConsumer](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/consumers.py#L9-L109)

- Notificações (NotificationConsumer):
  - Broadcast para `notifications_user_{user.id}` com dados da notificação e metadados (ex.: conversation_id, message_id). [notifications/consumers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/consumers.py)


## Tarefas Assíncronas

- Prévia de links (Celery)
  - Endpoint REST dispara tarefa `fetch_link_preview(url)`. Responde 202; resultado fica em cache por 24h. [tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/tasks.py)
  - Guardas contra SSRF, bloqueio de hosts locais/privados e content-type não HTML.

- Web Push (Celery)
  - Envia notificações usando VAPID e `pywebpush` para assinaturas ativas do usuário. [notifications/tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/tasks.py)


## Integração Front-end

- Componentes principais
  - Lista de contatos: presença, criação de grupos, filtro. [contact-list.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/messenger/contact-list.tsx)
  - Janela de chat: histórico infinito por `before`, envio (texto/anexo), resposta, edição, exclusão, reações, recibos de leitura, indicador de digitação, zoom de imagens. [chat-window.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/messenger/chat-window.tsx)

- Hooks de WebSocket
  - Chat: reconexão automática, atualização do cache de mensagens (React Query) sem refetch. [use-chat.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-chat.ts)
  - Presença: atualiza conjunto de usuários online. [use-presence.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-presence.ts)
  - Notificações: singleton WS, backoff exponencial, de-duplicação de toasts, deep-link para conversa. [use-notifications-v2.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-notifications-v2.ts)

- Histórico e paginação
  - GET `/conversations/{id}/messages/?before=<ISO>` retorna página ordenada cronologicamente; front usa o `created_at` do mais antigo como próxima âncora enquanto `next` existir. [chat-window.tsx (useInfiniteQuery)](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/messenger/chat-window.tsx#L194-L223)

- Service Worker e Web Push
  - Registro do SW em Providers. [providers.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/providers.tsx)
  - SW lida com eventos `push` e `notificationclick`. [public/sw.js](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/public/sw.js)
  - Componente para assinar push via VAPID (verificar `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). [PushNotificationManager.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/notifications/PushNotificationManager.tsx)


## Exemplos de API (cURL)

- Criar conversa (grupo):

```bash
curl -X POST "$API/api/messenger/conversations/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Projeto Atlas","participant_usernames":["alice","bob"],"is_group":true}'
```

- Buscar conversa 1:1 por participante:

```bash
curl "$API/api/messenger/conversations/find_by_participant/?username=alice" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```

- Listar mensagens com paginação por timestamp (`before`):

```bash
curl "$API/api/messenger/conversations/123/messages/?before=2026-02-01T12:00:00Z" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```

- Enviar mensagem (texto + arquivo opcional):

```bash
curl -X POST "$API/api/messenger/conversations/123/send_message/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -F "content=Olá equipe!" \
  -F "file=@/caminho/arquivo.pdf"
```

- Reagir/Remover reação:

```bash
curl -X POST "$API/api/messenger/messages/456/reaction/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"emoji":"👍","action":"add"}'
```

- Marcar como lida:

```bash
curl -X POST "$API/api/messenger/messages/456/mark_read/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```


## Diagramas de Fluxo

- Envio de Mensagem (REST + Broadcast WS)
```
Client            API (DRF)                Service            Channels           Clients (WS)
  | POST /conversations/{id}/send_message     |                     |                     |
  | content/file ---------------------------> |                     |                     |
  |                             persiste ---->|                     |                     |
  |                                          |-- broadcast -------->|-- chat_message ---> | (destinatários)
  | <----------- 201 (payload) --------------|                     |                     |
```

- Presença (WS)
```
Client                       PresenceConsumer                 Cache/DB           Other Clients
  | WS connect (token, company_slug) ---> |                                         |
  |                                        set online -----------------------------> |
  |                                        group_send presence_update --------------> online/offline
  | WS disconnect -----------------------> |                                         |
  |                                        set last_seen + offline ----------------> |
```


## Segurança, Multi-tenant e Performance

- Multi-tenant
  - REST: cabeçalho `X-Company-Slug` (axios adiciona automaticamente). [axios.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/lib/axios.ts)
  - WS: `company_slug` no handshake.
  - Managers/modelos garantem isolamento de dados por empresa.

- Acesso e permissões
  - `HasModuleAccess` controla acesso ao módulo Messenger. [views.py imports](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L8-L15)

- Throttling e Rate Limits
  - DRF Scoped Throttle para `link_preview` (15/min). [settings.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/config/settings.py#L61-L118) • [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L305-L309)
  - Rate limit de frames no Chat WS: 10/s por usuário. [consumers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/consumers.py#L127-L141)

- Prévia de links com SSRF-guards
  - Bloqueio de localhost/IPs privados, validação de redirecionamentos e checagem de Content-Type. [link_preview](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py#L344-L391) • [fetch_link_preview](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/tasks.py)

- Soft delete e mídia
  - Mensagem apagada preserva estrutura do histórico; campos de arquivo e conteúdo são limpos. Recomenda-se tarefa periódica para remoção do arquivo físico órfão. [models.py:soft_delete](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/models.py#L88-L101)


## Convenções, Limites e UX

- Tamanho de anexos
  - UI atual limita 10MB; validação do back indica 5MB (help_text/validator). Recomenda-se unificar o limite.

- Paginação por timestamp
  - O protocolo de histórico usa `before=<ISO created_at>` como âncora para puxar páginas anteriores; o back segue paginação DRF e a resposta mantém ordem cronológica para exibição.

- Preferências (mute/pin)
  - Back-end persiste por conversa (ConversationPreference). UI usa localStorage como cache local; recomenda-se alinhar chamadas para `/mute`, `/unmute`, `/pin`, `/unpin`.

- Abertura de mensagens via notificação
  - Sinal cria `Notification` com link `/messenger?conversation=<id>&message_id=<id>&created_at=<iso>`; front salva `focusMessageId/CreatedAt` e foca a mensagem no carregamento. [notifications/signals.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/signals.py#L1-L100) • [messenger/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/messenger/page.tsx#L103-L141)


## Variáveis de Ambiente

- Back-end
  - `REDIS_URL`: URL base do Redis (ex.: `redis://localhost:6379`).
  - **Separação Lógica de Bancos (Redis):**
    - `DB 0`: Cache (Django Default).
    - `DB 1`: Celery (Broker e Backend).
    - `DB 2`: Channels (Channel Layer).
  - `CELERY_*`: Configurações de broker e result backend.
  - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ALLOWED_HOSTS`.

- Front-end
  - `NEXT_PUBLIC_API_URL` (ex.: http://localhost:8005)
  - `NEXT_PUBLIC_COMPANY_SLUG` (multi-tenant, quando aplicável)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (para Web Push, se habilitado)


## Erros Comuns e Solução

- WS desconectando imediatamente
  - Verifique se o token de acesso está no query param (`?token=...`) e é válido; confira `company_slug`; revise CORS/CSRF e CSP CONNECT_SRC.

- Push não chega
  - Cheque VAPID keys configuradas (pública no front e privada no back) e se assinaturas estão ativas (`PushSubscription.is_active`). Verifique se Celery está rodando.

- Contatos vazios
  - Usuário sem grupos recebe lista vazia por regra atual; ajuste de negócio pode ser necessário para permitir “todos da empresa” exceto si próprio.


## FAQ

- Mensagens chegam duplicadas no histórico
  - Verificar se há múltiplas abas com WS aberto e se a deduplicação de IDs no cache do front está ativa.

- Indicador de digitação não aparece
  - Checar envio de `typing_status` no front e associação do usuário à conversa no consumer.

- Arquivo não abre via link
  - Validar `MEDIA_URL`/proxy de mídia e se o `file_url` é absoluto (serializer com `request` no contexto).

- Edição não atualiza para outros participantes
  - Confirmar `broadcast_edit` e handler `edit_message` no consumer e front.

- Recibos de leitura inconsistentes
  - Checar que somente destinatários disparam `mark_read` e que front trata o evento `read_receipt`.

- Anexo falha
  - Divergência de limite front vs back; valide tamanho no cliente com o mesmo limite do servidor.

- Prévia de link retorna 202 indefinidamente
  - Confirme execução do worker Celery; verifique cache Redis (recomendado em produção) ou log do task runner.


## Roadmap de Melhorias Recomendadas

1. (Concluído) Persistir preferências no front integrando `/mute|unmute|pin|unpin` e refletir `preference` do serializer na UI.
2. Unificar limite de anexos (UI/validador) e documentar.
3. (Concluído) Evitar duplicação de conversas 1:1 no serviço de criação (checar par antes de criar).
4. Padronizar paginação com campo explícito (ex.: `before_next`) além de `next` do DRF.
5. (Concluído) Otimizar consultas: subqueries para `last_message` e prefetch de `ConversationPreference` do usuário.
6. (Concluído) Task de limpeza de arquivos órfãos após soft delete (agendada diariamente).
7. SW: tratar `pushsubscriptionchange` e payloads não-JSON; (opcional) agrupar notificações por conversa.
8. (Concluído) Adicionar funcionalidade "Marcar todas como lidas" na conversa (REST + UI).


## Checklist de Configuração

- Variáveis de ambiente (Back-end)
  - `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`
  - `REDIS_URL` (recomendado para Channels + Cache em produção)
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_ADMIN_EMAIL`
  - Celery: `CELERY_*` conforme infraestrutura (ou usar variáveis padrão)

- Variáveis de ambiente (Front-end)
  - `NEXT_PUBLIC_API_URL` (ex.: `http://localhost:8005`)
  - `NEXT_PUBLIC_COMPANY_SLUG` (quando aplicável)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (64~88 base64-url characters)

- Infra
  - Channels com Redis em produção (latência e escala).
  - Worker Celery operando e com acesso ao cache/broker.
  - CSP `CONNECT_SRC` incluindo `ws:` e `wss:` e domínios necessários.


## Referências de Código

- Views/Endpoints: [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/views.py)
- Models: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/models.py)
- Services (broadcast, push): [services.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/services.py)
- Consumers (WS): [consumers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/consumers.py)
- Routing (WS): [routing.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/messenger/routing.py)
- Notificações (sinal/WS/push): [signals.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/signals.py), [consumers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/consumers.py), [tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/notifications/tasks.py)
- Front-end: 
  - Página: [messenger/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/messenger/page.tsx)
  - Chat: [chat-window.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/messenger/chat-window.tsx)
  - Hooks: [use-chat.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-chat.ts), [use-presence.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-presence.ts), [use-notifications-v2.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/hooks/use-notifications-v2.ts)
  - Tipos: [types/messenger.ts](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/types/messenger.ts)
  - Push/Service Worker: [PushNotificationManager.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/notifications/PushNotificationManager.tsx), [public/sw.js](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/public/sw.js)


---

Este documento consolida o funcionamento completo do Messenger e centraliza decisões, práticas de segurança e integrações. Use-o como referência para manutenção e evolução do módulo.
