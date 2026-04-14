# CRM API Changelog

## Contrato `column` como principal

### Ja disponivel
- O payload de deals expõe `column` como conceito principal.
- O payload de deals inclui `column_id`, `column_title` e `column_data`.
- Os aliases `stage_legacy_id` e `stage_legacy_name` ja foram removidos do payload padrao.
- O campo `stage_name` tambem ja foi removido do payload padrao.
- O campo `stage` tambem ja foi removido do payload padrao de deals.
- Deals e `sync-card` aceitam compatibilidade opt-in explicita com `?include_legacy_stage_fields=1`.
- O overview do pipeline expõe `columns` como fonte principal.
- O alias `overview.stages` tambem ja foi removido do payload padrao.
- O overview aceita compatibilidade opt-in explicita com `?include_legacy_overview_stages=1`.
- A rota legada `/api/crm/stages/` foi removida.
- O endpoint `POST /api/v1/integration/sync-card/` aceita `column_id`.
- O frontend oficial ja cria e atualiza cards usando `column` como entrada principal.

### Mantido por compatibilidade
- `stage` com `?include_legacy_stage_fields=1`
- `overview.stages` com `?include_legacy_overview_stages=1`

### Sinais de depreciacao
Os contratos legados ativos respondem com:

- `Warning`
- `X-Atlas-Deprecated: true`
- `X-Atlas-Deprecation-Message`
- `Sunset`
- `X-Atlas-Sunset-Phase`

### Recomendacao para novos clientes
1. Leia `column_id`, `column_title` e `column_data`.
2. Escreva usando `column` ou `column_id`.
3. Consuma `overview.columns`.
4. Nao dependa de `stage`; use `?include_legacy_stage_fields=1` apenas em clientes legados.
5. Nao dependa de `overview.stages`; use `?include_legacy_overview_stages=1` apenas em clientes legados.

### Impacto esperado
- Clientes que ainda leem `stage` continuam funcionando.
- Novos clientes nao devem depender da rota removida `/api/crm/stages/`.
- Clientes legados devem migrar qualquer acesso antigo de `/api/crm/stages/`.
- Integracoes devem migrar para `column_id` assim que possivel.

### Documentos relacionados
- [CRM_STAGE_TO_COLUMN_MIGRATION.md](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/docs/CRM_STAGE_TO_COLUMN_MIGRATION.md)
- [FRONTEND_HANDOFF.md](file:///c:/Users/yuri.menezes/Desktop/Projetos/atlas/backend/docs/FRONTEND_HANDOFF.md)
