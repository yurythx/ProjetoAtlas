# Integração GLPI -> n8n -> CRM (Inbound)

## Objetivo

Permitir que um orquestrador (n8n) envie eventos do GLPI para o Atlas e crie/atualize um card no CRM de forma segura, idempotente e multi-tenant.

## Autenticação e Tenant

Headers obrigatórios:

- `X-API-Key: <prefix>.<secret>` (API Key criada no tenant)
- `X-Company-Slug: <slug>` (tenant alvo)

Escopos recomendados (API Key):

- `crm.glpi_ticket`
- `crm.sync_card` (se também for usar o endpoint genérico de sync)

Assinatura (recomendado em produção):

- Header: `X-Integration-Signature: sha256=<hex>`
- O segredo é configurado em `TenantModule.config.integration.glpi.secret`
- O HMAC é calculado sobre o corpo bruto (raw body) do request

Exemplo n8n (Code node) para assinar o body:

```javascript
const crypto = require("crypto");

const secret = $env.ATLAS_INTEGRATION_SECRET;
const payload = $json;

const body = JSON.stringify(payload);
const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

return [
  {
    json: payload,
    headers: {
      "Content-Type": "application/json",
      "X-Integration-Signature": `sha256=${signature}`,
    },
    body,
  },
];
```

No HTTP Request node, envie o `body` como RAW (JSON) usando exatamente o texto assinado e reaproveite os headers.

## Endpoint

- `POST /api/v1/integration/glpi/tickets/`

Retorno:

- `201` quando criou um card
- `200` quando atualizou um card existente (idempotência)

## Idempotência

Se `external_id` não for enviado, o backend usa:

- `external_id = glpi:<ticket_id>`

Chamados repetidos com o mesmo `ticket_id` atualizam o mesmo card.

## Painel no Sistema

Em `Configurações -> Integrações`, o sistema exibe:

- Endpoint e headers obrigatórios (para copiar no n8n)
- Geração de API Key para integração
- Defaults do GLPI (pipeline/coluna/owner/técnico/contato) por tenant
- Eventos recebidos (auditoria)

## Payload (recomendado)

```json
{
  "ticket_id": "123",
  "title": "Chamado GLPI - Impressora",
  "description": "Usuário relata falha ao imprimir.",
  "priority_level": 4,
  "requester": {
    "name": "Alice",
    "email": "alice@example.com",
    "phone": "+55 11 99999-9999"
  },
  "custom_fields": {
    "glpi_url": "https://glpi.exemplo.com/front/ticket.form.php?id=123"
  }
}
```

## Payload alternativo (ticket completo)

```json
{
  "ticket": {
    "id": 123,
    "name": "Chamado GLPI - Impressora",
    "content": "Usuário relata falha ao imprimir.",
    "urgency": 4,
    "url": "https://glpi.exemplo.com/front/ticket.form.php?id=123"
  }
}
```

## Configuração por Tenant (CRM module config)

No `TenantModule.config` do módulo `crm`, é possível definir defaults para o inbound do GLPI:

```json
{
  "integration": {
    "glpi": {
      "pipeline_id": 1,
      "column_id": 10,
      "owner_id": 5,
      "tecnico_responsavel_id": 7,
      "contact_id": 99
    }
  }
}
```

Se `pipeline_id` não for configurado nem enviado, o sistema usa o primeiro pipeline do tenant.

## Exemplo curl

```bash
curl -X POST "http://localhost:8005/api/v1/integration/glpi/tickets/" \
  -H "Content-Type: application/json" \
  -H "X-Company-Slug: ti-solutions" \
  -H "X-API-Key: <prefix>.<secret>" \
  -d '{"ticket_id":"123","title":"Chamado GLPI","priority_level":4}'
```
