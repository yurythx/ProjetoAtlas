# Capacidades do Atlas (o que o projeto faz)

Este documento descreve as capacidades do Atlas em nível de produto e os módulos principais.

## Fundamentos (arquitetura de produto)

- Multi-tenant por empresa (isolamento forte por tenant)
- White-label por tenant (branding, tema, domínio)
- RBAC por papéis (roles) com permissões granulares e wildcard (`*`)
- Separação adicional por grupos no CRM (visibilidade por grupo além do tenant)
- Ativação/desativação de módulos por tenant (Module Manager)
- Auditoria (logs de ações relevantes)

## Módulos e funcionalidades

### Admin (Gestão de Empresas, Usuários e Segurança)

- Empresas (tenants): criação, branding, domínio, onboarding
- Usuários:
  - criação direta (admin)
  - convites por email (aceite via link)
  - bloqueio/desbloqueio (is_active)
  - reset de senha via email
  - associação a grupos do CRM
- Papéis (Roles):
  - catálogo de permissões
  - definição de responsabilidades por papel
- Configurações:
  - módulos ativos por tenant
  - LDAP por tenant (quando habilitado)

### CMS / Conteúdo (Articles e Pages)

- Artigos com fluxo editorial (rascunho → pendente → publicado/rejeitado)
- Comentários em artigos (quando habilitado)
- Histórico de versões e rollback (reversion)
- Páginas (CMS) para portal público e intranet
- SEO básico (metadados, rotas públicas)

### CRM / Atendimento

- Pipelines e colunas (Kanban) com configuração por tenant
- Visibilidade de pipeline:
  - por empresa (company)
  - por grupo (group) com isolamento para usuários fora do grupo
- Cards (deals) com:
  - prioridade, descrição, usuários relacionados
  - histórico e rastreabilidade na UI
- Integração com calendário e notificações em mudanças relevantes

### Messenger (Comunicação em tempo real)

- Chat em tempo real via WebSockets
- Presença (online/ocupado/offline)
- Ações e eventos do chat (quando habilitado)

### Notificações

- Notificações internas
- Web Push (VAPID) quando configurado

### Calendar

- Eventos e agenda
- Integração com CRM (prazos e sincronização de eventos)

### Finance / Payroll

- Controle financeiro (entradas/saídas, relatórios)
- Folha de pagamento (processamentos e cálculos)

### Licensing

- Planos e features por tenant
- Limites (ex.: max_users) aplicados em fluxos como convite/criação de usuários

### Webhooks

- Integrações baseadas em eventos com endpoints dedicados

## Infra e Operação

- Docker Compose (dev e produção)
- Cloudflare Tunnel para roteamento HTTPS sem expor portas públicas no host
- Storage S3 compatível (MinIO por padrão) com bucket privado (arquivos via proxy/autorização)
- Redis (cache + broker)
- Celery worker e beat

## Links úteis

- Deploy Docker: `docs/DEPLOY_DOCKER.md`
- Multi-tenant cheatsheet: `docs/MULTI_TENANT_CHEATSHEET.md`
- Módulos (Module Manager): `docs/MODULES.md`
- Messenger: `docs/MESSENGER.md`
- Pages: `docs/PAGES.md`
- Articles: `docs/ARTICLES.md`
- Notificações: `docs/NOTIFICATIONS.md`

