# 📦 Guia de Deploy — Atlas com Cloudflare Tunnel

> **Arquitetura**: Docker Compose (sem Nginx) + Cloudflare Tunnel para SSL/HTTPS  
> **Servidor**: Ubuntu 22.04 LTS  
> **Acesso**: Git pull → `./scripts/deploy.sh`

---

## 🚀 Início Rápido (Deploy Automatizado)

Se você já tem o servidor preparado com Docker e o Tunnel configurado, o deploy é resumido a:

```bash
cd /opt/atlas
git pull origin main
# Execute o script que cuida de tudo
./scripts/deploy.sh
```

---

## 🗺️ Visão Geral da Arquitetura

```
Internet
   │
   ▼
Cloudflare (SSL/DDoS/WAF)
   │
   ▼
cloudflared daemon ─── roteamento por hostname/path
   │
   ├── /api, /admin, /ws, /static, /media  →  localhost:8005 (Django/Daphne)
   │
   └── /* (resto)                          →  localhost:3005 (Next.js)

localhost:8005 → container atlas_backend (porta interna 8005)
localhost:3005 → container atlas_frontend (porta interna 3005)

Serviços internos (invisíveis externamente):
  atlas_db     (PostgreSQL)
  atlas_redis  (Redis)
  atlas_minio  (MinIO S3-compatible)
  atlas_celery (Celery Worker)
  atlas_celery_beat (Celery Beat)
```

**Vantagens**:
- ✅ SSL/HTTPS gerenciado automaticamente pelo Cloudflare
- ✅ Sem certificados para renovar (sem Let's Encrypt)  
- ✅ Sem Nginx (menos complexidade)
- ✅ DDoS protection + WAF gratuitos
- ✅ Portas 80/443 não precisam estar abertas no servidor

---

## 📋 Pré-requisitos

### Servidor Ubuntu 22.04 LTS

- 2 GB RAM mínimo (4 GB recomendado)
- 20 GB disco
- Docker Engine + Docker Compose v2
- Git

### Cloudflare

- Conta na Cloudflare
- Domínio configurado na Cloudflare (nameservers apontando para CF)

---

## 🔧 Passo 1: Preparar o Servidor

### 1.1 Instalar Docker

```bash
# Instalar dependências
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Adicionar repositório Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Adicionar usuário atual ao grupo docker (evita usar sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### 1.2 Configurar Firewall (UFW)

```bash
# Bloquear tudo por padrão
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir apenas SSH
sudo ufw allow 22/tcp

# Ativar
sudo ufw enable

# Verificar
sudo ufw status
```

> ⚠️ **IMPORTANTE**: Não abra as portas 8005, 3005, 5432, 6379, 9000.  
> O Cloudflare Tunnel conecta via loopback (`127.0.0.1`), nada precisa ser exposto.

---

## ☁️ Passo 2: Configurar Cloudflare Tunnel

### 2.1 Instalar cloudflared

```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
cloudflared --version
```

### 2.2 Autenticar na Cloudflare

```bash
cloudflared tunnel login
```

> Abrirá uma URL para você autorizar no browser. Após autorizar, um arquivo de credenciais será salvo em `~/.cloudflared/cert.pem`.

### 2.3 Criar o Tunnel

```bash
cloudflared tunnel create atlas-prod
```

Anote o **Tunnel ID** retornado (ex: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

### 2.4 Configurar DNS no Cloudflare Dashboard

Acesse **Cloudflare Dashboard → Seu Domínio → DNS → Add Record**:

| Campo   | Valor                                     |
|---------|-------------------------------------------|
| Type    | `CNAME`                                   |
| Name    | `@` (raiz) ou seu subdomínio              |
| Target  | `{TUNNEL_ID}.cfargotunnel.com`            |
| Proxied | ✅ Sim (ícone laranja ativado)             |

Se quiser `www` também:

| Campo   | Valor                                     |
|---------|-------------------------------------------|
| Type    | `CNAME`                                   |
| Name    | `www`                                     |
| Target  | `{TUNNEL_ID}.cfargotunnel.com`            |
| Proxied | ✅ Sim                                    |

### 2.5 Criar arquivo de configuração do Tunnel

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

**Conteúdo** (substitua `TUNNEL_ID` e `seudominio.com`):

```yaml
tunnel: TUNNEL_ID
credentials-file: /root/.cloudflared/TUNNEL_ID.json

ingress:
  # ── Backend (Django/Daphne) ──────────────────────────────
  # API, Admin, WebSockets, Static, Media
  - hostname: api.projetoravenna.cloud
    service: http://localhost:8005

  # ── Frontend (Next.js) — catch-all ──────────────────────
  - hostname: projetoravenna.cloud
    service: http://localhost:3005

  # Também rotear www para o frontend
  - hostname: www.projetoravenna.cloud
    service: http://localhost:3005

  # Fallback obrigatório
  - service: http_status:404
```

### 2.6 Instalar como serviço do sistema

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

### 2.7 Verificar status

```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

---

## 🚀 Passo 3: Deploy da Aplicação

### 3.1 Clonar o repositório

```bash
sudo mkdir -p /opt/atlas
sudo chown $USER:$USER /opt/atlas
cd /opt/atlas

git clone https://github.com/seu-usuario/atlas.git .
```

### 3.2 Configurar variáveis de ambiente

```bash
cp .env.prod.example .env.prod
nano .env.prod
```

Preencha **todos** os valores marcados com `CHANGE_ME`:

```bash
# Gerar SECRET_KEY
docker run --rm python:3.12-slim python -c \
  "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Gerar FIELD_ENCRYPTION_KEY
docker run --rm python:3.12-slim python -c \
  "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 3.3 Tornar scripts executáveis

```bash
chmod +x scripts/deploy.sh scripts/backup.sh scripts/restore.sh
```

### 3.4 Primeiro deploy

```bash
# Primeiro deploy pula o backup (banco ainda não existe)
SKIP_BACKUP=1 ./scripts/deploy.sh
```

### 3.5 Criar superusuário

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend python manage.py createsuperuser
```

---

## ✅ Passo 4: Verificação

### 4.1 Health check local (no servidor)

```bash
# Backend
curl http://localhost:8005/api/core/health/

# Resposta esperada:
# {"status": "healthy", "database": "ok", "redis": "ok", "minio": "ok"}

# Frontend
curl -sI http://localhost:3005 | head -5
```

### 4.2 Verificar containers

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Todos devem estar **Up** e **healthy**.

### 4.3 Acessar via internet

| Serviço       | URL                                |
|---------------|------------------------------------|
| Site          | `https://seudominio.com`           |
| Admin         | `https://seudominio.com/admin`     |
| API Docs      | `https://seudominio.com/api/schema/swagger-ui/` |
| Health        | `https://seudominio.com/api/core/health/` |

---

## 🔄 Deploys Subsequentes

### Via script (recomendado)

```bash
cd /opt/atlas
./scripts/deploy.sh
```

### Via GitHub Actions (automático)

Push na branch `main` → dispara o workflow automaticamente.

```bash
# No seu computador local:
git push origin main
```

Ou via tag versionada:

```bash
git tag v1.2.0
git push origin v1.2.0
```

### Restart rápido (sem rebuild)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod restart backend
```

---

## 📊 Monitoramento

### Logs em tempo real

```bash
# Todos os serviços
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f

# Apenas backend
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f backend

# Tunnel Cloudflare
sudo journalctl -u cloudflared -f
```

### Status dos serviços

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
sudo systemctl status cloudflared
```

---

## 🗄️ Backup

### Backup manual

```bash
# Banco de dados
BACKUP_DIR=/opt/atlas-backups ./scripts/backup.sh

# Ou direto:
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T db pg_dump -U atlas_user atlas_prod | gzip > backup_$(date +%F).sql.gz
```

### Restore

```bash
zcat backup_YYYY-MM-DD.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T db psql -U atlas_user atlas_prod
```

### Agendamento automático (cron)

```bash
# Adicionar ao crontab do servidor
crontab -e

# Backup diário às 3h da manhã (retém por 7 dias)
0 3 * * * cd /opt/atlas && BACKUP_DIR=/opt/atlas-backups RETENTION_DAYS=7 ./scripts/backup.sh >> /var/log/atlas-backup.log 2>&1
```

---

## 🆘 Troubleshooting

### Cloudflare não conecta

```bash
# Verificar logs
sudo journalctl -u cloudflared -n 100

# Reiniciar tunnel
sudo systemctl restart cloudflared

# Info do tunnel
cloudflared tunnel info atlas-prod

# Testar localmente
curl http://localhost:8005/api/core/health/
```

### 502 Bad Gateway via Cloudflare

```bash
# Verificar se o backend está rodando
docker compose -f docker-compose.prod.yml --env-file .env.prod ps backend

# Logs
docker compose -f docker-compose.prod.yml --env-file .env.prod logs backend --tail=100

# Restart
docker compose -f docker-compose.prod.yml --env-file .env.prod restart backend
```

### Container não sobe (unhealthy)

```bash
# Ver o motivo
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker inspect atlas_backend | grep -A 10 Health

# Logs detalhados
docker compose -f docker-compose.prod.yml --env-file .env.prod logs backend
```

### Erro de migração

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend python manage.py showmigrations

docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec backend python manage.py migrate --noinput --verbosity=2
```

### WebSocket (chat) não funciona

Verifique se o Cloudflare tem **WebSockets habilitado**:  
Dashboard → Network → WebSockets → **On**

---

## ⚙️ GitHub Actions — Configuração dos Secrets

Acesse: **Settings → Secrets and variables → Actions** do repositório.

| Secret         | Descrição                                          |
|----------------|----------------------------------------------------|
| `DEPLOY_HOST`  | IP ou hostname do servidor                         |
| `DEPLOY_USER`  | Usuário SSH (ex: `ubuntu`)                         |
| `DEPLOY_SSH_KEY` | Conteúdo da chave SSH privada                    |
| `DEPLOY_PORT`  | Porta SSH (padrão: `22`)                           |
| `DEPLOY_PATH`  | Caminho do projeto (ex: `/opt/atlas`)           |

### Gerar chave SSH para deploy

```bash
# No seu computador local:
ssh-keygen -t ed25519 -C "atlas-github-deploy" -f ~/.ssh/atlas_deploy

# Copiar chave pública para o servidor:
ssh-copy-id -i ~/.ssh/atlas_deploy.pub ubuntu@seu-servidor

# O valor de DEPLOY_SSH_KEY é o conteúdo da chave PRIVADA:
cat ~/.ssh/atlas_deploy
```

---

## 📚 Referências

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Django Deployment Checklist](https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/)
- [WhiteNoise](https://whitenoise.readthedocs.io/)
