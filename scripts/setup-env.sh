#!/bin/bash
# ============================================================
# ATLAS — Setup do .env.prod (Geração automática de segredos)
# ============================================================
# Uso (no servidor):
#   chmod +x scripts/setup-env.sh
#   ./scripts/setup-env.sh
# ============================================================

set -euo pipefail

GREEN='\033[38;5;46m'
WHITE='\033[38;5;15m'
GRAY='\033[38;5;240m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✔ $*${RESET}"; }
info() { echo -e "${GRAY}  > $*${RESET}"; }
ask()  { echo -e "${WHITE}  ? $*${RESET}"; }

echo ""
echo -e "${GREEN}============================================${RESET}"
echo -e "${GREEN}  ATLAS — Gerador de .env.prod${RESET}"
echo -e "${GREEN}============================================${RESET}"
echo ""

if [ -f ".env.prod" ]; then
    echo -e "  Arquivo .env.prod já existe. Fazendo backup..."
    cp .env.prod ".env.prod.bak.$(date +%F_%H-%M-%S)"
    ok "Backup criado"
fi

# ── Gera SECRET_KEY via Docker (Python) ─────────────────────
info "Gerando SECRET_KEY..."
SECRET_KEY=$(docker run --rm python:3.12-slim python -c \
    "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())")
ok "SECRET_KEY gerada"

# ── Gera FIELD_ENCRYPTION_KEY (Fernet) ──────────────────────
info "Gerando FIELD_ENCRYPTION_KEY..."
FIELD_KEY=$(docker run --rm python:3.12-slim bash -c \
    "pip install -q cryptography 2>/dev/null && python -c \
    'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'")
ok "FIELD_ENCRYPTION_KEY gerada"

# ── Gera senhas fortes via openssl ───────────────────────────
PG_PASS="$(openssl rand -base64 24 | tr -d '/+=\n' | head -c 32)"
REDIS_PASS="$(openssl rand -base64 24 | tr -d '/+=\n' | head -c 32)"
MINIO_PASS="$(openssl rand -base64 24 | tr -d '/+=\n' | head -c 32)"
MINIO_USER="atlas_minio_admin"
ok "Senhas geradas"

# ── Coleta o TUNNEL_TOKEN ────────────────────────────────────
echo ""
ask "Cole o TUNNEL_TOKEN do Cloudflare Dashboard e pressione ENTER:"
echo -e "${GRAY}  (Zero Trust → Access → Tunnels → sua tunnel → Configure → botão 'Install connector')${RESET}"
read -r TUNNEL_TOKEN
if [ -z "$TUNNEL_TOKEN" ]; then
    echo "  AVISO: TUNNEL_TOKEN vazio. Preencha manualmente em .env.prod depois."
    TUNNEL_TOKEN="PENDING_FILL_TUNNEL_TOKEN"
fi

# ── Escreve o .env.prod completo ─────────────────────────────
info "Escrevendo .env.prod..."

cat > .env.prod << EOF
# ============================================================
# ATLAS — Production Environment Variables (Cloudflare Tunnel)
# ============================================================
# Gerado automaticamente em $(date)
# ============================================================

# ── Versão da aplicação ──────────────────────────────────────
APP_VERSION=1.0.0

# ── Django ───────────────────────────────────────────────────
DEBUG=False
SECURE_SSL_REDIRECT=False

SECRET_KEY=${SECRET_KEY}
FIELD_ENCRYPTION_KEY=${FIELD_KEY}

# ── Domínio ──────────────────────────────────────────────────
ALLOWED_HOSTS=api.projetoravenna.cloud,atlas.projetoravenna.cloud,backend
CORS_ALLOWED_ORIGINS=https://atlas.projetoravenna.cloud
CSRF_TRUSTED_ORIGINS=https://atlas.projetoravenna.cloud,https://api.projetoravenna.cloud

# ── Database (PostgreSQL) ────────────────────────────────────
POSTGRES_DB=atlas_prod
POSTGRES_USER=atlas_user
POSTGRES_PASSWORD=${PG_PASS}
DATABASE_URL=postgresql://atlas_user:${PG_PASS}@db:5432/atlas_prod

# ── Cache / Broker (Redis) ───────────────────────────────────
REDIS_PASSWORD=${REDIS_PASS}
REDIS_URL=redis://:${REDIS_PASS}@redis:6379/0

# ── Object Storage (MinIO) ───────────────────────────────────
USE_S3=True
MINIO_ROOT_USER=${MINIO_USER}
MINIO_ROOT_PASSWORD=${MINIO_PASS}
AWS_ACCESS_KEY_ID=${MINIO_USER}
AWS_SECRET_ACCESS_KEY=${MINIO_PASS}
AWS_STORAGE_BUCKET_NAME=atlas-media
AWS_S3_ENDPOINT_URL=http://minio:9000
AWS_S3_REGION_NAME=us-east-1

# ── Frontend ─────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.projetoravenna.cloud
API_URL_INTERNAL=http://backend:8005
FRONTEND_URL=https://atlas.projetoravenna.cloud

# ── Celery ───────────────────────────────────────────────────
CELERY_CONCURRENCY=2

# ── Monitoramento (Opcional) ─────────────────────────────────
SENTRY_DSN=

# ── Cloudflare Tunnel ────────────────────────────────────────
TUNNEL_TOKEN=${TUNNEL_TOKEN}
EOF

ok ".env.prod criado com sucesso!"

# ── Resumo ──────────────────────────────────────────────────
echo ""
echo -e "${GREEN}============================================${RESET}"
echo -e "${GREEN}  CREDENCIAIS GERADAS (guarde em segurança!)${RESET}"
echo -e "${GREEN}============================================${RESET}"
echo -e "${GRAY}  PostgreSQL senha : ${PG_PASS}${RESET}"
echo -e "${GRAY}  Redis senha      : ${REDIS_PASS}${RESET}"
echo -e "${GRAY}  MinIO user       : ${MINIO_USER}${RESET}"
echo -e "${GRAY}  MinIO senha      : ${MINIO_PASS}${RESET}"
echo ""
echo -e "${GREEN}  Próximo passo:${RESET}"
echo -e "${GRAY}  SKIP_BACKUP=1 ./scripts/deploy.sh${RESET}"
echo ""
