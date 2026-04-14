# Cheatsheet Multi-tenant

Guia rápido para chamadas REST e WebSocket em ambiente multi-tenant.


## REST

- Sempre envie o header `X-Company-Slug: <slug>` para endpoints autenticados.
- Para endpoints públicos que dependem de tenant (ex.: artigos públicos), informe `company_slug` na query string quando o host não estiver mapeado por empresa.

Exemplos:
```bash
# Autenticado
curl "$API/api/messenger/conversations/" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Company-Slug: $COMPANY"

# Público (artigos) com tenant explícito
curl "$API/api/articles/public/articles/?company_slug=$COMPANY"
```


## WebSocket

- Inclua `token` (JWT) e `company_slug` na URL do WS.
- Ajuste CSP CONNECT_SRC para permitir `ws:`/`wss:`.

Exemplos:
```
ws://<host>/ws/chat/<conversation_id>/?token=<JWT>&company_slug=<slug>
ws://<host>/ws/notifications/?token=<JWT>&company_slug=<slug>
ws://<host>/ws/presence/?token=<JWT>&company_slug=<slug>
```


## Front-end

- Axios autenticado adiciona `Authorization` e pode preencher `X-Company-Slug` automaticamente. Ver: frontend/src/lib/axios.ts
- Para páginas públicas, ao usar um cliente “limpo”, não esqueça de enviar `company_slug` ou o header quando o contexto não vier do domínio.


## Erros Comuns

- 403 em endpoint autenticado
  - Header `X-Company-Slug` ausente ou inválido; módulo desenedo no tenant (ver Module Manager).

- WS desconecta ao conectar
  - `token` ausente/expirado ou `company_slug` inválido; revisar CSP CONNECT_SRC.

- Listagens públicas misturando tenants
  - Faltou `company_slug` na query ou inferência por domínio.


## Boas Práticas

- Padronize helpers de chamada (REST e WS) que sempre injetem o contexto de tenant.
- Evite depender do localStorage/estado local para informações críticas de tenant.
- Teste cURLs com e sem o header para validar comportamento em cada endpoint.

