# Política de Segurança

## Relato de Vulnerabilidades
Reporte vulnerabilidades por e-mail para a equipe (ex.: security@blackbone.io).
Inclua:
- Descrição e impacto
- Passos de reprodução
- Módulos/endpoints afetados

## Boas Práticas
- Não commitar credenciais, `.env`, `db.sqlite3`, `media/`, `staticfiles/`
- Usar validação de senha e RBAC
- Informar `X-Company-Slug` e filtrar por tenant
