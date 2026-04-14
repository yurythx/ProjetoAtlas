# CRM - Migracao de `stage` para `column`

Este guia resume a transicao do contrato publico do CRM para `column` como conceito principal, mantendo compatibilidade temporaria com `stage`.

## Objetivo

- Padronizar `column` como eixo principal de leitura e escrita no CRM.
- Manter `stage` apenas como camada de compatibilidade durante a migracao.
- Dar um caminho claro para frontend, integracoes e automacoes.

## Estado Atual

- O frontend ja cria e atualiza cards usando `column` como entrada principal.
- O backend continua derivando `stage` quando necessario para compatibilidade interna e contratos legados.
- O overview do pipeline expoe `columns` como fonte principal; `stages` ficou restrito a compatibilidade opt-in.
- A rota legada `/api/crm/stages/` ja foi removida.

## Escrever no CRM

Use estes campos como referencia principal:

```json
{
  "column": 12
}
```

Casos principais:

- Criacao de card: prefira enviar `column`.
- Atualizacao de card: prefira PATCH com `column`.
- Sync de integracao: prefira `column_id` no endpoint `sync-card`.

## Ler do CRM

Priorize estes campos no payload de deals:

- `column`
- `column_id`
- `column_title`
- `column_data`

Os aliases `stage_legacy_*` ja foram removidos do payload padrao.
O campo `stage_name` tambem ja foi removido do payload padrao.
O campo `stage` tambem ja foi removido do payload padrao.

Considere este campo como legado:

- `stage`

Se um cliente legado ainda precisar desse campo, use:

- `?include_legacy_stage_fields=1`

## Pipeline Overview

Consumo recomendado:

- Use `overview.columns` como fonte principal.
- O alias `overview.stages` ja nao faz parte do payload padrao.
- Se um cliente legado ainda precisar desse alias, use:
  - `?include_legacy_overview_stages=1`

Exemplo padrao:

```json
{
  "pipeline_id": 1,
  "pipeline_name": "Suporte TI",
  "summary": {
    "total_deals": 3,
    "total_value": "2000.00",
    "overdue": 1,
    "at_risk": 0,
    "done": 1,
    "average_progress": 68
  },
  "columns": [
    {
      "column_id": 10,
      "column_title": "Novo",
      "name": "Novo",
      "total_deals": 1,
      "overdue": 1,
      "average_progress": 25
    }
  ]
}
```

## Sinais de Depreciacao

Os contratos legados ativos ja expõem headers HTTP de depreciacao:

- `Warning`
- `X-Atlas-Deprecated: true`
- `X-Atlas-Deprecation-Message`
- `Sunset`
- `X-Atlas-Sunset-Phase`

Atualmente isso vale para:

- alias `stages` no endpoint de overview do CRM

## Sequencia Recomendada de Migracao

1. Atualize leitura para usar `column_id`, `column_title` e `column_data`.
2. Atualize escrita para enviar `column` ou `column_id`.
3. Mude o consumo do overview para `columns`.
4. Trate `stage` apenas como compatibilidade opt-in temporaria via `?include_legacy_stage_fields=1`.
5. Trate `overview.stages` apenas como compatibilidade opt-in temporaria via `?include_legacy_overview_stages=1`.
6. Monitore os headers de depreciacao para remover dependencias legadas.

## O que ainda nao deve ser removido

Por enquanto, nao assuma remocao imediata de:

- campo `stage` no modelo de deal
- alias `overview.stages`
- logs e atividades que ainda referenciam `stage_change`

Esses pontos ainda existem para garantir transicao segura entre frontend, backend e integracoes.

## Referencias Rapidas

- Changelog resumido para integradores:
  - [CRM_API_CHANGELOG.md](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/docs/CRM_API_CHANGELOG.md)
- Handoff tecnico do frontend:
  - [FRONTEND_HANDOFF.md](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/docs/FRONTEND_HANDOFF.md)
