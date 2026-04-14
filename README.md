# 🌍 Atlas - Plataforma SaaS Multi-Tenant (ITIL v5 Suite)

> Plataforma SaaS white-label de nível empresarial orientada ao ITIL v5, multitenant (clientes múltiples).

---

## � Documentação

- Visão geral (índice): [docs/SYSTEM_OVERVIEW.md](docs/SYSTEM_OVERVIEW.md)
- Capacidades do produto (features): [docs/FEATURES.md](docs/FEATURES.md)
- Deploy com Docker (dev e produção): [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md)
- Cloudflare Tunnel (produção): [ops/DEPLOY_CLOUDFLARE.md](ops/DEPLOY_CLOUDFLARE.md)

## �🚀 Início Rápido (Deploy Oficial)

A forma oficial e mais rápida de colocar o Atlas em produção é utilizando o nosso script de automação.

```bash
# 1. Clone o repositório
git clone <url_do_repositorio>
cd atlas

# 2. Configure o ambiente de produção
cp .env.prod.example .env.prod
# Edite as variáveis conforme necessário
nano .env.prod

# 3. Execute o Deploy
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Se você estiver no Windows ou preferir um deploy manual, siga: [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md).

### 🌍 Acesso Pós-Deploy
*   **Frontend**: `https://projetoravenna.cloud`
*   **Backend API**: `https://api.projetoravenna.cloud`
*   **Admin**: `https://api.projetoravenna.cloud/admin`

Para detalhes sobre a configuração do Cloudflare Tunnel, veja o guia: [Manual Cloudflare](ops/DEPLOY_CLOUDFLARE.md)

---

## ✨ Funcionalidades

Para uma lista completa e atualizada: [docs/FEATURES.md](docs/FEATURES.md).

### 🏢 Multi-Tenancy & White-Label
- **Isolamento de Empresas**: Separação completa de dados por cliente.
- **Branding Personalizado**: Cores, logos, fontes e CSS/JS customizados por tenant.
- **Temas Dinâmicos**: Troca de tema em tempo real.
- **Integração Google Fonts**: Tipografia personalizada para cada empresa.

### 🧩 Gestão de Módulos (Module Manager)
- **Ativação Dinâmica**: Recursos são habilitados por tenant.
- **Isolamento de API**: Permissões bloqueiam acesso a APIs de módulos inativos (`HasModuleAccess`).

### 📝 CMS (Sistema de Gestão de Conteúdo)
- **Fluxo Editorial**: Status rigorosos (Rascunho, Pendente, Publicado, Rejeitado).
- **Controle de Versão**: Histórico e rollback com `django-reversion`.
- **Moderação**: Painel de aprovação/rejeição em lote com motivos de auditoria.
- **Otimização SEO**: Meta tags, sitemaps e portal público.

### 💻 ITIL v5 Suite (Service Desk & Operations)
- **Gestão de Incidentes e Requisições**: Service Desk integrado.
- **Catálogo de Serviços**: Foco no ciclo de vida de ativos e catálogo de serviços (ITIL v5).
- **Gestão de Mudanças e Problemas**: Rastreio de impactos no ecossistema.

### 💰 Financeiro & Folha de Pagamento
- **Controle Financeiro**: Gestão de receitas, despesas e relatórios.
- **Folha de Pagamento (Payroll)**: Processamento de salários, cálculos de 13º e férias.

### 👥 Gestão de Usuários
- **Autenticação Segura**: JWT em cookies HttpOnly.
- **Autenticação LDAP**: Integração corporativa multi-tenant.
- **RBAC (Controle de Acesso)**: Permissões granulares baseadas em papéis, com suporte a wildcard (`*`).
- **Grupos CRM**: Separação adicional de acesso em pipelines por grupos (além do tenant).
- **Onboarding**: Fluxo guiado para novas empresas.

### 💳 Licenciamento & Monetização
- **Planos em Camadas**: Free, Pro e Enterprise.
- **Gating de Funcionalidades**: Controle de acesso a módulos via middleware.
- **Gestão de Licenças**: Rastreamento de assinaturas.

### 💬 Comunicação
- **Messenger**: Chat em tempo real via WebSockets.
- **Notificações Push**: Suporte a notificações VAPID no navegador.
- **Webhooks**: Integrações baseadas em eventos.

---

## 🏗️ Stack Tecnológica

| Camada | Tecnologia |
|-------|------------|
| **Backend** | Django 5.0, Django REST Framework |
| **Frontend** | Next.js 15, React 19, TypeScript |
| **Banco de Dados** | PostgreSQL 16 |
| **Cache & Broker** | Redis 7 |
| **Storage** | MinIO (padrão S3) |
| **Fila de Tarefas** | Celery |
| **WebSockets** | Django Channels (Daphne) |
| **Infra** | Docker, Cloudflare Tunnel |

---

## 📂 Estrutura do Projeto

```
atlas/
├── backend/                 # API Django (Python)
│   ├── apps/               # Aplicações específicas
│   ├── config/             # Configurações globais (settings)
│   └── requirements.txt    # Dependências
├── frontend/               # Aplicação Next.js (TypeScript)
│   ├── src/
│   │   ├── app/            # App Router
│   │   └── components/     # Componentes UI
├── docs/                   # Documentação técnica e de produto
├── scripts/                # Scripts de automação (Deploy, Backup)
└── docker-compose.prod.yml # Orquestração oficial de produção
```

---

## 🔧 Desenvolvimento Local

Se você deseja rodar o projeto para desenvolvimento:

```bash
# Usando Docker Compose de Dev
docker compose up -d --build

# Backend disponível em: http://localhost:8005
# Frontend disponível em: http://localhost:3005
```

Para passo a passo com seed/migrações e troubleshooting: [docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md).

---

## 🧪 Testes

```bash
# Testes do Backend
cd backend
python -m pytest

# Testes do Frontend
cd frontend
npm run test
```

## ✅ Qualidade (lint/typecheck)

```bash
# Backend (lint)
cd backend
python -m ruff check .

# Frontend
cd frontend
npm run lint
npx tsc -p tsconfig.json --noEmit
```

## 🧰 Bootstrap (primeira instalação)

Em um banco vazio, o comando abaixo cria um tenant padrão (`raiz`) e usuários iniciais (inclui `suporte/suporte123`):

```bash
cd backend
python manage.py seed_system
```

Para popular ambiente local com dados de exemplo:

```bash
python manage.py seed_local
```

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

---

**Desenvolvido com ❤️ para aplicações SaaS modernas.**
