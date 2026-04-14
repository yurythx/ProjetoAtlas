# GitHub Secrets — Configuração para CI/CD

Acesse: **Settings → Secrets and variables → Actions** no repositório do GitHub.

---

## Secrets obrigatórios para Deploy (`deploy.yml`)

| Secret | Descrição | Como obter |
|--------|-----------|------------|
| `DEPLOY_HOST` | IP ou hostname do servidor de produção | Painel do seu VPS/servidor |
| `DEPLOY_USER` | Usuário SSH (ex: `ubuntu`, `atlas`) | Configurado no servidor |
| `DEPLOY_SSH_KEY` | Chave SSH privada (conteúdo completo do arquivo) | `cat ~/.ssh/atlas_deploy` |
| `DEPLOY_PORT` | Porta SSH (opcional, padrão: `22`) | `/etc/ssh/sshd_config` |
| `DEPLOY_PATH` | Caminho do projeto no servidor (ex: `/opt/atlas`) | Onde você fez o `git clone` |

### Gerar par de chaves SSH para deploy

```bash
# No seu computador local:
ssh-keygen -t ed25519 -C "atlas-github-deploy" -f ~/.ssh/atlas_deploy

# Copiar chave pública para o servidor:
ssh-copy-id -i ~/.ssh/atlas_deploy.pub ubuntu@seu-servidor

# O valor de DEPLOY_SSH_KEY é o conteúdo da chave PRIVADA:
cat ~/.ssh/atlas_deploy
```

---

## Secrets para E2E Tests (opcionais)

| Secret | Descrição |
|--------|-----------|
| `E2E_USERNAME` | Usuário de teste no banco de dados |
| `E2E_PASSWORD` | Senha do usuário de teste |
| `E2E_COMPANY_SLUG` | Slug da empresa de teste |

---

## Environment protection (recomendado)

Configure o environment `production` com reviewer obrigatório:

1. Acesse **Settings → Environments → New environment**
2. Nome: `production`
3. Marque **Required reviewers** e adicione você mesmo
4. Isso garante que o deploy só acontece após aprovação manual

---

## Checklist pré-primeiro-deploy

- [ ] Servidor Ubuntu 22.04 com Docker Engine + Docker Compose v2 instalados
- [ ] Repositório foi clonado em `DEPLOY_PATH` (ex: `/opt/atlas`)
- [ ] Arquivo `.env.prod` existe em `DEPLOY_PATH` com todos os valores preenchidos
- [ ] `cloudflared` instalado e serviço rodando (`systemctl status cloudflared`)
- [ ] DNS configurado no Cloudflare (CNAME apontando para o tunnel)
- [ ] Primeiro deploy manual executado: `SKIP_BACKUP=1 ./scripts/deploy.sh`
- [ ] Superusuário criado: `docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py createsuperuser`
- [ ] Health check respondendo: `curl http://localhost:8005/api/core/health/`
- [ ] Site acessível em: `https://seudominio.com`
