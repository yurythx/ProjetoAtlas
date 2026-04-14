# Módulo Articles — Guia Completo

Este documento descreve arquitetura, modelos, endpoints públicos e privados, integrações de frontend, fluxo editorial, notificações, métricas, requisitos de segurança e melhores práticas do módulo Articles.


## Visão Geral


- CMS de artigos com:
  - Categorias e tags por empresa (multi-tenant).
  - Artigos com status editorial (rascunho, pendente, publicado, rejeitado).
  - Publicação pública opcional (is_public) com SEO.
  - Histórico de versões (django-reversion) e “revert” seguro.
  - Comentários (privados com permissão; públicos com moderação).
  - Métricas de visualização (ArticleView) e analytics.
  - Integração com licenças (limites), webhooks e notificações (Web Push).


## Arquitetura

- Back-end (Django/DRF)
  - Endpoints privados para gestão (categorias, tags, artigos, comentários).
  - Endpoints públicos de artigos e comentários, com rate limit.
  - Sanitização de HTML e textos no serializer.
  - Analytics agregados por tenant.
  - Integração com licensing (limites), webhooks (eventos) e reversion.

- Front-end (Next.js/React)
  - Dashboard: CRUD de artigos, vitrine pública, preview autenticado e analytics.
  - Público: listagem e detalhe com SEO e conteúdo renderizado.


## Modelos de Dados (Back-end)

- Category
  - name, slug
  - slug único por empresa
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/models.py#L8-L19)

- Tag
  - name, slug, meta_title, meta_description
  - slug único por empresa
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/models.py#L20-L33)

- Article
  - title, slug, content, excerpt, author, category, tags
  - status: draft|pending|published|rejected
  - is_public, published_at, rejection_reason
  - image (ImageField com validação e ajuda “max 10MB”)
  - SEO: meta_title, meta_description, meta_keywords
  - Índices para consultas públicas e por tenant
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/models.py#L35-L101)

- ArticleView
  - article, ip_address, user, viewed_at
  - Índices por (article, viewed_at) e (company, viewed_at)
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/models.py#L103-L113)

- Comment
  - article, author (opcional), name, email, content, is_approved
  - Ordenação por created_at desc
  - Código: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/models.py#L115-L129)


## API REST (Privado)

Base: `/api/articles/`

- Categorias `/categories/`
  - CRUD, sem paginação, audit log. [views.py:CategoryViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L83-L109)

- Tags `/tags/`
  - CRUD, sem paginação, audit log. [views.py:TagViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L118-L144)

- Artigos `/articles/`
  - GET: lista artigos do tenant do usuário (search, filtros). [get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L170-L189)
  - GET `{id}`: registra view e retorna detalhes. [retrieve](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L190-L194)
  - POST: cria artigo com slug único, imagem opcional e audit log; respeita limites da licença. [perform_create](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L196-L212)
  - PATCH/PUT: atualiza com reversion e webhooks. [perform_update](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L213-L222)
  - DELETE: remove com audit log + webhook. [perform_destroy](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L223-L226)
  - GET `{id}/history/`: histórico de versões (metadados). [history](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L227-L247)
  - POST `{id}/revert/` `{version_id}`: reverte para versão segura. [revert](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L248-L263)
  - POST `{id}/submit/`: muda status → pending. [submit_for_review](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L265-L273)
  - POST `{id}/publish/`: publica, define `published_at` e dispara notificações. [publish](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L274-L282)
  - POST `{id}/reject/` `{reason?}`: rejeita pendente e salva motivo. [reject](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L283-L292)
  - GET `/analytics/`: métricas globais (tenant). [analytics](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L293-L347)
  - GET `{id}/analytics_detail/`: métricas por artigo. [analytics_detail](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L348-L370)
  - Busca/ordenação/filtros: SearchFilter (title, content, excerpt) + FilterSet (title, content, category, author, is_published; datas). [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L163-L166) • [filters.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/filters.py)

- Comentários (privado) `/comments/`
  - Requer permissão `articles.comment_moderate`. Aprovação via POST `{id}/approve/`. [CommentViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L380-L406)


## API REST (Público)

Base: `/api/articles/public/`

- Artigos `/articles/`
  - GET: lista artigos públicos e publicados; filtro por empresa via `company_slug` ou `X-Company-Slug`. [PublicArticleViewSet.get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L41-L63)
  - GET `/articles/{slug}/`: detalhe com registro de visualização para anônimos. [retrieve](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L64-L74)

- Comentários `/comments/`
  - GET: lista comentários aprovados para um artigo público (por `article_slug` ou `article`). [PublicCommentViewSet.get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L424-L445)
  - POST: cria comentário pendente de moderação com rate limit (5/10min/IP). Requer `article_slug` ou `article`. [create](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L447-L493)


## Exemplos de API (cURL)

- Criar artigo:

```bash
curl -X POST "$API/api/articles/articles/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Novo Post","slug":"novo-post","content":"<p>Conteúdo</p>","category":1,"tags":[2,3],"is_public":false}'
```

- Atualizar artigo (parcial):

```bash
curl -X PATCH "$API/api/articles/articles/123/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Título Atualizado"}'
```

- Histórico e Revert:

```bash
curl "$API/api/articles/articles/123/history/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"

curl -X POST "$API/api/articles/articles/123/revert/" \
  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" \
  -d '{"version_id": "456"}'
```

- Submeter, Publicar, Rejeitar:

```bash
curl -X POST "$API/api/articles/articles/123/submit/"  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
curl -X POST "$API/api/articles/articles/123/publish/" -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY"
curl -X POST "$API/api/articles/articles/123/reject/"  -H "Authorization: Bearer $TOKEN" -H "X-Company-Slug: $COMPANY" \
  -H "Content-Type: application/json" -d '{"reason":"Falta revisão"}'
```

- Comentário público (pendente de moderação):

```bash
curl -X POST "$API/api/articles/public/comments/" \
  -H "Content-Type: application/json" \
  -d '{"article_slug":"meu-post","name":"Convidado","email":"guest@example.com","content":"Muito bom!"}'
```


## Fluxo Editorial e Versionamento

- Estados do Artigo
  - draft → submit → pending → publish → published
  - pending → reject → rejected (com `rejection_reason`)
  - Regras implementadas em [ArticleService](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L137-L187)

- Versionamento (django-reversion)
  - create/update registram revisões com usuário e comentário.
  - revert valida `content_type` e `object_id` antes de aplicar. [revert_to_version](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L229-L259)


## Notificações e Webhooks

- Ao publicar
  - Dispara webhooks `article.published` e tarefa Celery `notify_article_published` que envia Web Push a usuários ativos da empresa. [services.py:publish_article](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L145-L175) • [tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/tasks.py)

- Outros eventos
  - create/update/delete disparam webhooks com payload mínimo para integração. [services.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L69-L77) • [services.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L129-L135) • [services.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L188-L205)


## Métricas (Analytics)

- Registro de visualizações
  - Deduplicação por 1h (cache) via chave `article_view:{article}:{user|ip}`. [record_view](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py#L205-L227)

- Endpoints
  - `/articles/analytics/`: total de artigos, total de views, top 5, série de 15 dias. [views.py:analytics](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L293-L347)
  - `/articles/{id}/analytics_detail/`: total, últimos 30 dias e visitantes únicos. [views.py:analytics_detail](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L348-L370)


## Integração Front-end

- Dashboard
  - Página principal: abas “Meus artigos” e “Vitrine pública”, busca (?search), filtro por categoria, criação/edição, preview autenticado. [artigos/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/artigos/page.tsx)
  - Lista interna com filtros e exclusão (usa `search` e `category`). [article-list.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/articles/article-list.tsx)
  - Analytics globais (gráficos, totais, top 5). [article-analytics.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/articles/article-analytics.tsx)
  - Preview autenticado por slug. [preview/[slug]/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/artigos/preview/[slug]/page.tsx)

- Público
  - Listagem pública com busca local e filtros visuais. [p/artigos/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(public)/p/artigos/page.tsx)
  - Detalhe público com SEO (OpenGraph/Twitter/JSON-LD) e conteúdo HTML renderizado (sanitização no back). [p/artigos/[slug]/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(public)/p/artigos/[slug]/page.tsx)
  - Cartão público. [article-card.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/public/article-card.tsx)


## Diagramas de Fluxo

- Fluxo Editorial
```
Autor (dashboard)           API/Service                        Eventos/Notificações
   Draft ---------------> create_article ---------------------> webhook: article.created
    |                                                   
    └-- submit --------> submit_for_review (status=pending)
                              |
                        publish_article (status=published, is_published=True, published_at=now)
                              |------------> webhook: article.published
                              └------------> task: notify_article_published (Web Push)
```

- Registro de Views e Analytics
```
Leitor (público)        PublicArticleViewSet.retrieve      Service.record_view         DB/Cache         Analytics
   GET /public/...  --> get_object + serializer   -----> dedupe cache (1h) -----> ArticleView ----> agregações
```


## Variáveis de Ambiente

- Back-end
  - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ALLOWED_HOSTS`
  - `REDIS_URL` (cache para dedupe de views; recomendado em produção)
  - Storage de mídia (S3/MinIO): variáveis do provider conforme ambiente
  - Celery (opcional): broker/result para tarefas (ex.: notify ao publicar)

- Front-end
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_COMPANY_SLUG` (para reforçar contexto em páginas públicas)
  - `NEXT_PUBLIC_APP_URL` (SEO/JSON-LD)


## Segurança, Multi-tenant e Performance

- Multi-tenant
  - Privado: queries sempre filtradas por `request.company` para usuário autenticado. [views.py:get_queryset](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L170-L189)
  - Público: filtro por empresa via `request.company` (header/domínio) ou `company_slug`/`X-Company-Slug`. [PublicArticleViewSet](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py#L41-L63)

- Sanitização
  - HTML sanitizado no serializer; textos plain também. [serializers.py:validate](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/serializers.py#L29-L63)

- Rate limits e cache
  - Throttle para públicos (scope `public_articles`), cache leve via Next.js para páginas públicas, e deduplicação de views pelo cache do servidor.


## Convenções, Limites e UX

- Busca
  - Use `?search=` para buscar por título/conteúdo/excerpt (SearchFilter). Filtros adicionais: `?category=`, `?author=`, `?is_published=`, `?created_at_after/before=`. [filters.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/filters.py)

- Imagens
  - ImageField com validação; help_text indica 10MB. Definir claramente o limite desejado entre front/back para coerência.

- SEO
  - Recomendado preencher `excerpt`, `meta_title`, `meta_description` (<=160 caracteres) e `meta_keywords`. Serializer aplica sanitização/validação. [serializers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/serializers.py#L37-L46)


## Erros Comuns e Solução

- Publicar sem permissão
  - O serviço verifica `has_perm('articles.publish_article')`, mas não bloqueia estritamente (comentado). Se necessário, reforçar permissão na action ou serviço.

- published_at preservado (M2)
  - A data de publicação é definida apenas na primeira transição para 'published', sendo preservada em edições posteriores.

- Artigos públicos de outros tenants aparecendo na listagem pública
  - Sempre enviar `company_slug`/`X-Company-Slug` no front público para manter o contexto do tenant.

- Comentários públicos (spam)
  - Rate limit básico existe, mas considerar CAPTCHA/honeypot/serviço anti-spam para maior proteção.


## Roadmap de Melhorias Recomendadas

1. Reforçar permissão de publicação (service + action publish).
2. published_at: implementado controle para setar apenas na primeira publicação.
3. Tornar `is_published` derivado do `status` (ou sincronizar invariavelmente).
4. Enviar `company_slug` sempre nas chamadas públicas do front.
5. Comentários públicos: integrar CAPTCHA/honeypot.
6. Geração automática de `excerpt` quando ausente (primeiros N caracteres sem HTML).
7. Cache HTTP/CDN para listagem pública com invalidação por webhook.
8. Analytics: referrer/user-agent agregados e intervalos configuráveis.


## Checklist de Configuração

- Variáveis do Back-end
  - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ALLOWED_HOSTS`
  - `REDIS_URL` (recomendado para cache e melhora de performance de analytics)
  - Celery broker/result se quiser tarefas assíncronas

- Variáveis do Front-end
  - `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_COMPANY_SLUG`
  - `NEXT_PUBLIC_APP_URL` (para JSON-LD/OG)

- Infra
  - Banco e storage de mídia apropriados (S3/MinIO em produção).
  - Worker Celery configurado se desejar push/automatizações de publicação.


## Referências de Código

- Views/Endpoints: [views.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/views.py)
- Models: [models.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/models.py)
- Serializers: [serializers.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/serializers.py)
- Services (regras/editorial/webhooks/notify): [services.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/services.py)
- Filtros: [filters.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/filters.py)
- Tarefas (notificações ao publicar): [tasks.py](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/apps/articles/tasks.py)
- Front-end:
  - Dashboard: [artigos/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/artigos/page.tsx), [article-list.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/articles/article-list.tsx), [article-analytics.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/features/articles/article-analytics.tsx), [preview/[slug]/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(dashboard)/artigos/preview/[slug]/page.tsx)
  - Público: [p/artigos/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(public)/p/artigos/page.tsx), [p/artigos/[slug]/page.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/app/(public)/p/artigos/[slug]/page.tsx), [article-card.tsx](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/frontend/src/components/public/article-card.tsx)


---

Este documento consolida o funcionamento do módulo Articles e centraliza decisões, práticas de segurança e integrações. Utilize-o como referência para manutenção e evolução.


## FAQ

- “is_published” e “status” divergem
  - Use as actions do fluxo editorial; evite atualizar is_published isoladamente.

- published_at zerado após atualizar
  - A regra atual atualiza sempre ao publicar; ajustar lógica se precisar preservar a data original.

- Imagem não aparece no público
  - Certifique-se que `cover_image`/`image` retornam URL acessível (proxy/MinIO) e que o front utiliza esses campos.

- Lista pública traz artigos de outros tenants
  - Envie `company_slug` e header `X-Company-Slug` nas chamadas públicas.

- Comentários spam
  - Habilitar mecanismos adicionais (CAPTCHA/honeypot) além do rate limit por IP.
