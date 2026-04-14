# Módulo Pages — Guia Completo

Este documento descreve arquitetura, modelos, endpoints, integrações de frontend, segurança e melhores práticas do módulo Pages (CMS de páginas estáticas).


## Visão Geral

- Gerenciamento de páginas estáticas por empresa (multi-tenant):
  - Título, slug, conteúdo (HTML/Markdown), publicação.
  - Campos de SEO (meta_title, meta_description, meta_keywords).
  - Slug único por empresa.
  - Sanitização de HTML e textos.
  - Proteção por módulo (HasModuleAccess).


## Arquitetura

- Back-end (Django/DRF)
  - Model Page com controle de publicação e SEO.
  - Endpoints REST privados (necessita autenticação e módulo ativo).
  - Sanitização de conteúdo no serializer e verificação de slug único.

- Front-end (Next.js/React)
  - Formulário de criação/edição com editor rico e preview.
  - Integra com API interna via axios autenticado.


## Modelos (Back-end)

- Page
  - title, slug, content, is_published, created_at, updated_at
  - SEO: meta_title, meta_description (160 máx), meta_keywords
  - unique_together (company, slug)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/models.py#L1-L24)


## API REST

Base: `/api/pages/`

- PageViewSet
  - GET: lista páginas da empresa atual (paginado). [views.py:get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/views.py#L28-L33)
  - POST: cria página; retorna 400 se slug duplicado para a empresa. [views.py:create](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/views.py#L34-L41)
  - PATCH/PUT/DELETE: atualiza/remove página.
  - Protegido por HasModuleAccess com `module_code='pages'`. [views.py:class PageViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/views.py#L12-L27)

Serializer:
  - Sanitiza título/slug (plain) e conteúdo (HTML). Valida meta_description <= 160. [serializers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/serializers.py)


## Integração Front-end

- Formulário de Páginas (dashboard)
  - Zod + React Hook Form, editor rico, preview, SEO inputs. [features/pages/page-form.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/pages/page-form.tsx)

- Preview genérico (compartilhado com artigos)
  - [components/cms/preview-dialog.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/cms/preview-dialog.tsx)

- Acesso no layout
  - Itens de menu condicionais ao módulo `pages` estar ativo (via `useModules`). [sidebar.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/sidebar.tsx) • [mobile-nav.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/mobile-nav.tsx)


## Exemplos de API (cURL)

- Listar páginas (tenant atual):

```bash
curl "$API/api/pages/" -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```

- Criar página:

```bash
curl -X POST "$API/api/pages/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sobre","slug":"sobre","content":"<p>Quem somos</p>","is_published":true}'
```

- Atualizar página:

```bash
curl -X PATCH "$API/api/pages/123/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Sobre Nós"}'
```

- Remover página:

```bash
curl -X DELETE "$API/api/pages/123/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
```


## Diagramas de Fluxo

- CRUD de Página
```
Autor (dashboard)   --->   API /api/pages/   --->   DB
 create/update/delete      valida + sanitiza       persiste
```

- Publicação (exibição)
```
Site/App (privado)   --->   API /api/pages/ (tenant)   ---> renderização no front
```


## Segurança e Multi-tenant

- HasModuleAccess garante que somente tenants com `pages` ativo usem os endpoints.
- Sanitização de conteúdo no serializer previne XSS, preservando tags permitidas.
- Slug único por empresa (resposta 400 se duplicado).


## Variáveis de Ambiente

- Back-end
  - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ALLOWED_HOSTS`
  - Storage de mídia (S3/MinIO) quando servir imagens incorporadas

- Front-end
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_COMPANY_SLUG`


## Checklist de Configuração

- Back-end
  - Ativar módulo `pages` para o tenant (Module Manager).
  - Garantir sanitização ativa (serializer padrão).
  - Verificar CORS/CSRF/CSP para os domínios do painel.

- Front-end
  - Form de páginas acessível apenas para tenants com `pages` ativo.
  - Editor rico configurado e Preview funcional.


## Erros Comuns e Solução

- 403 ao acessar `/api/pages/`
  - Verifique se o módulo `pages` está ativo para a empresa (Module Manager).

- 400 “Slug já existe para esta empresa”
  - Ajuste o slug para um valor único por tenant.

- Quebra de layout por HTML malformado
  - O HTML é sanitizado, mas recomenda-se editor que gere HTML válido; utilizar preview antes de publicar.


## Referências de Código

- Models: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/models.py)

- Serializers: [serializers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/serializers.py)

- Views: [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/pages/views.py)

- Front-end: [page-form.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/pages/page-form.tsx), [preview-dialog.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/cms/preview-dialog.tsx), [sidebar.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/sidebar.tsx), [mobile-nav.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/layout/mobile-nav.tsx)


---

Documento de referência para o módulo Pages.


## FAQ

- 403 ao acessar `/api/pages/`
  - Verifique se o módulo `pages` está ativo e se o usuário está autenticado no tenant correto.

- 400 “Slug já existe” ao criar página
  - O slug é único por empresa; ajuste o valor (ex.: `about-2`) ou edite a existente.

- HTML não renderiza como esperado
  - O serializer sanitiza o conteúdo; tags fora da whitelist podem ser removidas. Ajuste o editor/whitelist conforme política.

- SEO não assume meta_description
  - O campo é limitado a 160 caracteres; verifique a validação no serializer.

- Menu do app não exibe CMS
  - A UI oculta itens quando o módulo está inativo; ative `pages` no Module Manager.
