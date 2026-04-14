# Módulo Module Manager — Guia Completo

Este documento descreve arquitetura, modelos, endpoints e integrações do gerenciador de módulos (ativação por tenant) e a permissão HasModuleAccess.


## Visão Geral

- Catálogo global de módulos (ex.: pages, articles, messenger).
- Ativação/Desativação por empresa (TenantModule).
- Cache por tenant para lista de módulos ativos.
- Permissão HasModuleAccess para proteger ViewSets por `module_code`.


## Arquitetura

- Back-end (Django/DRF)
  - Endpoints:
    - Catálogo global: leitura (listagem completa).
    - Módulos por tenant: CRUD e atalho “activate”. 
  - Permissão guard: HasModuleAccess verifica se o módulo está ativo para o tenant, com bypass para superuser.
  - Cache per-tenant para listagens (decorators utilities).

- Front-end
  - Tela de gestão de módulos para staff (ativar/desativar).
  - Hooks/guards no layout para ocultar menus de módulos inativos.


## Modelos (Back-end)

- Module (global)
  - code (único), name, description, is_default
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/models.py#L3-L16)

- TenantModule (por empresa)
  - company (herdado de BaseTenantModel), module (FK), is_active, config (JSON per-tenant)
  - Único por (company,module)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/models.py#L18-L29)


## Permissão HasModuleAccess

- Uso: adicione `module_code = 'articles' | 'messenger' | 'pages'` no ViewSet e inclua HasModuleAccess em `permission_classes`.
- Bypass: superusuario tem acesso independentemente do estado do módulo.
- Lógica: verifica TenantModule.is_active=True para (request.company,module_code). [permissions.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/permissions.py)


## API REST

Base: `/api/modules/`

- Catálogo global `/available/`
  - GET: lista todos os módulos (paginado). [urls.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/urls.py) • [views.py:ModuleViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/views.py#L1-L15)

- Módulos do tenant `/my-modules/`
  - GET: lista ativos (cacheado por 1h). Cache é invalidado em create/update/destroy. [views.py:TenantModuleViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/views.py#L17-L40)
  - POST: cria/associa um TenantModule ao company atual.
  - PATCH/PUT/DELETE: atualiza/remove e invalida cache.
  - POST `/my-modules/activate/` body `{ "module_code": "<code>" }`: atalho para ativar rapidamente. [views.py:activate_module](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/views.py#L42-L74)

Serializers: [serializers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/serializers.py)


## Exemplos de API (cURL)

- Listar catálogo de módulos:
```bash
curl "$API/api/modules/available/" -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```

- Listar módulos do tenant:
```bash
curl "$API/api/modules/my-modules/" -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```

- Ativar módulo (ex.: articles):
```bash
curl -X POST "$API/api/modules/my-modules/activate/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"module_code":"articles"}'
```


## Integração Front-end

- Gestão de módulos (somente staff): [admin/modules/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/admin/modules/page.tsx) e [features/admin/module-list.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/admin/module-list.tsx)
- Ocultação de itens no menu com base em módulos ativos (ex.: sidebar e mobile-nav usam `useModules`). [sidebar.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/sidebar.tsx) • [mobile-nav.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/mobile-nav.tsx)


## Segurança e Boas Práticas

- Sempre definir `module_code` nos ViewSets protegidos; isso evita exposição acidental de endpoints quando um módulo estiver desativado.
- Superuser é bypass; para cenários mais rígidos, considerar permissão adicional (HasRolePermission).


## Checklist de Configuração

- Back-end
  - Criar registros em `Module` (ex.: pages, articles, messenger).
  - Ativar módulos por tenant via `/api/modules/my-modules/activate/`.
  - Definir `module_code` nos ViewSets que dependem do módulo e incluir `HasModuleAccess`.

- Front-end
  - Ocultar/mostrar menus com base em módulos ativos (`useModules`).
  - Proteger rotas sensíveis (painéis) conforme necessidade.


## Erros Comuns e Solução

- Endpoint protegido retorna 403
  - Verificar se TenantModule para o módulo está ativo para a empresa. Ativar via `/my-modules/activate/`.

- Lista de módulos não reflete alterações recentes
  - A listagem é cacheada; invalidate ocorre em create/update/delete no próprio ViewSet. Em alterações diretas no banco, limpar cache manualmente.


## Referências de Código

- Models: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/models.py)
- Permissions: [permissions.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/permissions.py)
- Views/URLs: [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/views.py), [urls.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/urls.py)
- Serializers: [serializers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/module_manager/serializers.py)


---

Documento de referência para gestão de módulos e proteção de endpoints por módulo.


## FAQ

- Recebo 403 mesmo sendo staff
  - HasModuleAccess não considera papel; ative o módulo para o tenant ou torne o usuário superuser (bypass).

- Ativei módulo mas UI ainda oculta o menu
  - A listagem de módulos do tenant é cacheada; aguarde a invalidação (create/update/destroy) ou recarregue.

- Quero configurações por tenant
  - Use o campo `config` (JSON) do TenantModule e leia nas views/components relevantes.

- Preciso ativar vários módulos de uma vez
  - Use o endpoint `/my-modules/activate/` programaticamente para cada código que precisa habilitar.

- Endpoint público aparece apesar do módulo off
  - Proteções por módulo valem para views autenticadas; endpoints públicos devem ser tratados conforme a estratégia de cada app.
