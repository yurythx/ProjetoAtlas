# Atlas — Plataforma SaaS Multi-Tenant (ITIL Version 5 Suite)

> Plataforma SaaS white-label de nível empresarial orientada ao ITIL Version 5, multi-tenant, com autenticação JWT, RBAC granular, módulos dinâmicos por tenant e observabilidade integrada.

---

## Documentação

| Documento | Descrição |
|---|---|
| [docs/SYSTEM_OVERVIEW.md](docs/SYSTEM_OVERVIEW.md) | Visão geral e arquitetura |
| [docs/FEATURES.md](docs/FEATURES.md) | Lista completa de funcionalidades |
| [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md) | Deploy local e produção com Docker |
| [ops/DEPLOY_CLOUDFLARE.md](ops/DEPLOY_CLOUDFLARE.md) | Cloudflare Tunnel para produção |

---

## Início Rápido

```bash
# 1. Clone o repositório
git clone <url_do_repositorio>
cd atlas

# 2. Configure o ambiente de produção
cp .env.prod.example .env.prod
nano .env.prod          # edite as variáveis necessárias

# 3. Execute o deploy
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

**Acessos pós-deploy:**
- Frontend: `https://projetoravenna.cloud`
- Backend API: `https://api.projetoravenna.cloud`
- Admin: `https://api.projetoravenna.cloud/admin`
- Monitoramento: `http://<host>:3000` (Grafana)

---

## Funcionalidades

### Multi-Tenancy & White-Label
- Isolamento completo de dados por cliente via campo `company`
- Branding personalizado: cores, logos, fontes e CSS/JS por tenant
- Gestão de módulos ativados por tenant (`HasModuleAccess`)

### Autenticação & Controle de Acesso
- JWT com refresh rotation e blacklist (access: 15min, refresh: 30d)
- **RBAC granular** com permissões por string e suporte a wildcard (`*`)
- Autenticação LDAP corporativa multi-tenant
- **API Keys** para integrações externas: geração, revogação, expiração, scopes e rastreio de uso
- Convites por e-mail e onboarding guiado

### CMS — Base de Conhecimento
- Fluxo editorial (Rascunho → Revisão → Publicado) com django-reversion
- Portal público com SEO otimizado: robots.txt, sitemap.xml dinâmico por tenant
- Artigos públicos acessíveis sem autenticação (React Server Components)

### ITIL Version 5 Suite
- **CRM Kanban**: pipelines, colunas, deals com prioridade, SLA e tipo de registro
- **Automação de CRM**: regras configuráveis por pipeline (trigger → condição → ação) executadas via Celery
- **Catálogo de Serviços**: itens e definições com controle de acesso por tenant
- **CMDB**: inventário de ativos de TI com tipos e status
- **Gestão de Mudanças e Problemas**: registro e rastreio de impacto

### Relatórios & Exportação
- Geração assíncrona (Celery) de relatórios em **CSV** e **PDF**
- Módulos cobertos: **CRM (deals)**, **Financeiro**, **Artigos**, **Folha de Pagamento**
- Polling de status por task ID; download direto quando pronto
- Modal de exportação com filtros por período, status e formato

### Financeiro & Folha de Pagamento
- Controle de receitas, despesas, categorias e status de pagamento
- Folha de pagamento: runs mensais, linhas (proventos/descontos), 13º e férias
- Exportação de relatórios financeiros e de folha em CSV/PDF

### Inteligência Artificial
- **Resumo automático** de artigos (Gemini / OpenAI)
- **Sugestão de prioridade** para deals baseada em histórico e tipo de registro
- **Geração de rascunho** de artigo a partir de um título
- **Classificação automática** de incidentes com sugestão de categoria e SLA

### Comunicação
- **Messenger** em tempo real via WebSockets (Django Channels / Daphne)
- Notificações push VAPID no navegador
- **Webhooks** com retry automático e histórico de entregas

### Licenciamento
- Planos Free, Pro e Enterprise com gating de módulos via middleware
- Rastreamento de assinaturas por tenant

### Calendário
- Eventos com suporte a dia inteiro, categorias por cor e participantes

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Backend** | Django 5.0, Django REST Framework, Celery, Channels (Daphne) |
| **Frontend** | Next.js 15, React 19, TypeScript, TanStack Query, Zustand |
| **Banco de Dados** | PostgreSQL 16 + PgBouncer (connection pooling) |
| **Cache & Broker** | Redis 7 |
| **Storage** | MinIO (compatível com S3) |
| **WebSockets** | Django Channels (protocolo ASGI) |
| **Internacionalização** | next-intl (pt-BR + en-US) |
| **UI** | Tailwind CSS 4, Radix UI, Framer Motion |
| **PWA** | Serwist (service worker, cache-first para assets) |
| **Observabilidade** | Prometheus, Grafana, Sentry, Flower (Celery) |
| **Infra** | Docker Compose, Cloudflare Tunnel |
| **CI/CD** | GitHub Actions (lint → testes → build → E2E → deploy) |

---

## Estrutura do Projeto

```
atlas/
├── backend/
│   ├── apps/
│   │   ├── accounts/        # Usuários, roles, LDAP, invites
│   │   ├── ai/              # Integrações Gemini/OpenAI
│   │   ├── api_keys/        # API Key auth para integrações externas
│   │   ├── articles/        # CMS — base de conhecimento
│   │   ├── calendar/        # Eventos e agendamentos
│   │   ├── cmdb/            # Inventário de ativos de TI
│   │   ├── core/            # Company, branding, health check
│   │   ├── crm/             # Kanban, deals, automações
│   │   ├── finance/         # Transações e categorias financeiras
│   │   ├── messenger/       # Chat em tempo real (WebSockets)
│   │   ├── module_manager/  # Ativação dinâmica de módulos por tenant
│   │   ├── notifications/   # Notificações in-app e push
│   │   ├── pages/           # Páginas estáticas por tenant
│   │   ├── payroll/         # Folha de pagamento
│   │   ├── reports/         # Exportação CSV/PDF assíncrona
│   │   ├── service_catalog/ # Catálogo de serviços ITIL
│   │   ├── seo/             # robots.txt, sitemap.xml
│   │   └── webhooks/        # Subscriptions, entregas e retry
│   ├── config/              # settings.py, urls.py, celery.py, wsgi/asgi
│   ├── factories.py         # Factory Boy — fixtures de teste
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router (dashboard + público)
│   │   ├── components/      # UI compartilhada (shadcn/Radix)
│   │   ├── features/        # Lógica por domínio (crm, finance, reports…)
│   │   ├── api/generated/   # Client TypeScript gerado do schema OpenAPI
│   │   └── i18n/            # Configuração next-intl
│   └── e2e/                 # Testes Playwright (login, CRM, artigos, reports…)
├── docs/                    # Documentação técnica e de produto
├── scripts/                 # deploy.sh, backup.sh, seed
├── docker-compose.yml       # Ambiente de desenvolvimento
└── docker-compose.prod.yml  # Produção (inclui PgBouncer, Flower, Prometheus, Grafana)
```

---

## Desenvolvimento Local

```bash
# Sobe todos os serviços (backend, frontend, DB, Redis, MinIO)
docker compose up -d --build

# Backend:  http://localhost:8005
# Frontend: http://localhost:3005
# MinIO:    http://localhost:9001
```

### Bootstrap (primeira execução)

```bash
cd backend

# Cria tenant padrão "raiz" e usuário suporte/suporte123
python manage.py seed_system

# Popula com dados de exemplo (deals, artigos, transações)
python manage.py seed_local
```

---

## Testes

### Backend (Django)

```bash
cd backend
python manage.py test          # todos os apps
python manage.py test apps.reports apps.api_keys apps.seo  # módulos específicos
```

Cobertura ≥ 93% com Factory Boy para fixtures — sem fixtures manuais.

### Frontend (Vitest)

```bash
cd frontend
npm run test           # watch mode
npm run test:coverage  # relatório de cobertura
```

### E2E (Playwright)

```bash
cd frontend

# requer backend em :8005 e frontend em :3005 rodando
npx playwright test

# relatório HTML
npx playwright show-report
```

Suítes disponíveis: login, dashboard, CRM, artigos, relatórios, messenger, usuários, portal público.

---

## CI/CD (GitHub Actions)

O pipeline possui três jobs em sequência:

```
backend-test  →  frontend-test  →  e2e-test
    │                  │               │
  pytest            Vitest        Playwright
  lint              lint          (Chromium)
  OpenAPI           TypeScript
  schema            client drift
```

O job `e2e-test` sobe Django + Next.js no runner, semeia o usuário de teste e executa todas as suítes Playwright. O relatório HTML é salvo como artefato por 7 dias.

---

## Lint & Typecheck

```bash
# Backend
cd backend
black --check .
flake8 . --select=E9,F63,F7,F82

# Frontend
cd frontend
npm run lint
npx tsc -p tsconfig.json --noEmit
```

---

## Observabilidade

| Serviço | Porta | Descrição |
|---|---|---|
| Grafana | 3000 | Dashboards de métricas (Django, Celery, PostgreSQL) |
| Prometheus | 9090 | Coleta de métricas via django-prometheus |
| Flower | 5555 | Monitor de workers e filas Celery |
| Sentry | — | Rastreamento de erros em produção |

O endpoint `/api/health/` retorna latência de DB, Redis, MinIO e profundidade da fila Celery.

---

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

---

**Desenvolvido para aplicações SaaS enterprise modernas.**
