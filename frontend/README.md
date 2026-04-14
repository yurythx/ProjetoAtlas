# Atlas Frontend (Next.js)

## Como rodar

```bash
npm install
npm run dev
```

Acesse: http://localhost:3005

## Variáveis de Ambiente

- `NEXT_PUBLIC_API_URL` (ex.: http://localhost:8005)
- `NEXT_PUBLIC_COMPANY_SLUG` (multi-tenant)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Web Push, opcional)

## Multi-tenant e Autenticação

- As requisições usam `Authorization: Bearer <token>` e header `X-Company-Slug`.
- WebSockets exigem `?token=<access>&company_slug=<slug>` na URL.

## Documentação

- Índice: ../docs/SYSTEM_OVERVIEW.md
- Módulos: ../docs/MESSENGER.md, ../docs/ARTICLES.md, ../docs/NOTIFICATIONS.md, ../docs/MODULES.md, ../docs/PAGES.md

## Push Notifications

- Service Worker em `public/sw.js`.
- Gerenciamento de inscrição: `src/components/notifications/PushNotificationManager.tsx`.

## Scripts úteis

```bash
npm run build
npm run lint
npm run api:generate
```
