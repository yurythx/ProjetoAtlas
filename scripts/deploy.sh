#!/bin/bash
# ============================================================
# ATLAS — Script de Deploy
# ============================================================
# Uso:
#   ./scripts/deploy.sh           # Build local + deploy
#   ./scripts/deploy.sh --pull    # Pull imagens do GHCR + deploy
#   SKIP_BACKUP=1 ./scripts/deploy.sh  # Primeiro deploy (sem backup)
# ============================================================

set -Eeuo pipefail

# ── Cores ────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
GREEN='\033[38;5;46m'
DGREEN='\033[38;5;22m'
WHITE='\033[38;5;15m'
GRAY='\033[38;5;240m'

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
DC="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# ── Error Handler ────────────────────────────────────────────
error_handler() {
    echo -e "\n${GREEN}${BOLD}[FATAL] Erro na linha $1. Abortando.${RESET}" >&2
    exit 1
}
trap 'error_handler $LINENO' ERR

# ── Funções Utilitárias ──────────────────────────────────────

# Le variavel do .env corretamente (suporta senhas com '=')
get_env() {
    grep -E "^${1}=" "$ENV_FILE" | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d $'\r' | xargs
}

# Barra de progresso simples
progress() {
    local label="$1"
    local secs="$2"
    local steps=20
    local interval
    interval=$(awk "BEGIN {printf \"%.2f\", $secs / $steps}")
    local i=0
    while [ "$i" -lt "$steps" ]; do
        i=$(( i + 1 ))
        local pct=$(( i * 100 / steps ))
        printf "\r${GREEN}  [Progresso: %3d%%]${RESET}  %s" "$pct" "$label"
        sleep "$interval"
    done
    echo ""
}

header() {
    clear
    echo -e "${GREEN}${BOLD}"
    echo "  ╔══════════════════════════════════════════╗"
    echo "  ║     ATLAS DEPLOY SYSTEM v2.1             ║"
    echo "  ║     Cloudflare Tunnel + Docker Stack      ║"
    echo "  ╚══════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo -e "${DGREEN}  > TARGET: ${ENV_FILE}${RESET}"
    echo ""
}

ok()   { echo -e "${GREEN}   ✔ $*${RESET}"; }
err()  { echo -e "${GREEN}   [ERROR] $*${RESET}" >&2; }
info() { echo -e "${GRAY}   $*${RESET}"; }
warn() { echo -e "${DGREEN}   ⚠ $*${RESET}"; }

# ── Início ───────────────────────────────────────────────────
header
mkdir -p logs

# ══════════════════════════════════════════════════════════
# FASE 0: VERIFICAÇÃO DE SISTEMA
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 0: VERIFICACAO DE SISTEMA${RESET}"

for cmd in docker git curl awk; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        err "'${cmd}' nao encontrado."
        exit 1
    fi
done

if [ ! -f "$ENV_FILE" ]; then
    err "Arquivo $ENV_FILE nao encontrado!"
    echo "  Dica: cp .env.prod.example .env.prod"
    exit 1
fi

# Valida variaveis criticas no .env.prod
MISSING=0
for var in SECRET_KEY FIELD_ENCRYPTION_KEY \
           POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL \
           REDIS_PASSWORD REDIS_URL \
           MINIO_ROOT_USER MINIO_ROOT_PASSWORD \
           AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY \
           ALLOWED_HOSTS CORS_ALLOWED_ORIGINS CSRF_TRUSTED_ORIGINS \
           NEXT_PUBLIC_API_URL FRONTEND_URL \
           FLOWER_PASSWORD GRAFANA_PASSWORD \
           TUNNEL_TOKEN; do
    val="$(get_env "$var")"
    if [ -z "$val" ] || echo "$val" | grep -q "CHANGE_ME"; then
        err "Variavel ${var} ausente ou ainda com CHANGE_ME em ${ENV_FILE}"
        MISSING=1
    fi
done
if [ "$MISSING" -eq 1 ]; then
    err "Preencha as variaveis acima antes de continuar."
    exit 1
fi

# Valida o docker-compose
if ! $DC config > logs/compose_config.log 2>&1; then
    err "Falha ao validar docker compose. Veja logs/compose_config.log"
    tail -n 20 logs/compose_config.log || true
    exit 1
fi

ok "Sistema pronto para deploy"
echo ""

# ══════════════════════════════════════════════════════════
# FASE 1: BACKUP
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 1: PRESERVACAO DE DADOS${RESET}"
mkdir -p ./backups
BACKUP_FILE="./backups/backup_$(date +%F_%H-%M-%S).sql"

if [ "${SKIP_BACKUP:-0}" = "1" ]; then
    warn "SKIP_BACKUP=1 detectado, backup ignorado (modo primeiro deploy)."
elif $DC ps --status=running 2>/dev/null | grep -q "atlas_db"; then
    DB_USER="$(get_env POSTGRES_USER)"
    DB_NAME="$(get_env POSTGRES_DB)"
    if $DC exec -T db pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>>logs/deploy_error.log; then
        progress "BACKUP DATABASE" 2
        ok "Backup realizado: $(basename "$BACKUP_FILE")"
    else
        warn "Backup falhou (pg_dump). Deploy continua. Veja logs/deploy_error.log"
    fi
else
    progress "SKIP BACKUP (DB OFFLINE)" 1
    warn "Banco de dados offline, backup pulado."
fi
echo ""

# ══════════════════════════════════════════════════════════
# FASE 2: GIT PULL
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 2: SINCRONIZACAO DE CODIGO${RESET}"
if ! git pull origin main > logs/git_pull.log 2>&1; then
    err "Falha no git pull. Veja logs/git_pull.log"
    exit 1
fi
progress "GIT PULL ORIGIN" 3
ok "Repositorio atualizado"
echo ""

# ══════════════════════════════════════════════════════════
# FASE 3: BUILD / PULL DE IMAGENS
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 3: BUILD DE IMAGENS${RESET}"

if [ "${1:-}" = "--pull" ]; then
    info "Baixando imagens do GHCR..."
    $DC pull 2>&1 | tee logs/pull.log
    progress "PULL IMAGES" 2
else
    info "Construindo imagens (BuildKit)..."
    BUILD_EXIT=0
    COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 $DC build > logs/build.log 2>&1 || BUILD_EXIT=$?
    
    if [ "$BUILD_EXIT" != "0" ]; then
        echo ""
        err "Falha crítica no build das imagens (Exit Code: $BUILD_EXIT)!"
        echo -e "${GRAY}--- Ultimas 50 linhas do logs/build.log ---${RESET}"
        tail -n 50 logs/build.log || true
        echo -e "${GRAY}------------------------------------------${RESET}"
        err "Acesse logs/build.log para o log completo."
        exit 1
    fi
    progress "BUILD IMAGES" 2
fi
ok "Imagens prontas"
echo ""

# ══════════════════════════════════════════════════════════
# FASE 3.1: INFRA BASICA (DB, Redis, MinIO)
# ══════════════════════════════════════════════════════════
info "Iniciando infra basica (DB, Redis, MinIO)..."
$DC up -d db redis minio > /dev/null 2>&1
progress "INFRA BASICA" 4

# ── Aguarda DB ──────────────────────────────────────────
echo -n "   Aguardando DB..."
DB_USER_CHECK="$(get_env POSTGRES_USER)"
DB_NAME_CHECK="$(get_env POSTGRES_DB)"
DB_PASS_CHECK="$(get_env POSTGRES_PASSWORD)"

if [ -z "$DB_USER_CHECK" ] || [ -z "$DB_NAME_CHECK" ] || [ -z "$DB_PASS_CHECK" ]; then
    echo ""
    err "POSTGRES_USER/DB/PASSWORD ausentes em $ENV_FILE"
    exit 1
fi

DB_READY=0
for i in $(seq 1 30); do
    if $DC exec -T db pg_isready -U "$DB_USER_CHECK" -d "$DB_NAME_CHECK" > /dev/null 2>&1; then
        echo -e " ${GREEN}[READY]${RESET}"
        DB_READY=1
        break
    fi
    sleep 2
    echo -n "."
done
if [ "$DB_READY" -eq 0 ]; then
    echo ""
    err "DB nao ficou pronto a tempo."
    $DC logs db --tail=50 || true
    exit 1
fi

# ── Aguarda Redis ────────────────────────────────────────
echo -n "   Aguardando Redis..."
REDIS_PASS_CHECK="$(get_env REDIS_PASSWORD)"
REDIS_READY=0
for i in $(seq 1 20); do
    if $DC exec -T redis redis-cli -a "$REDIS_PASS_CHECK" ping > /dev/null 2>&1; then
        echo -e " ${GREEN}[READY]${RESET}"
        REDIS_READY=1
        break
    fi
    sleep 2
    echo -n "."
done
if [ "$REDIS_READY" -eq 0 ]; then
    echo ""
    err "Redis nao ficou pronto a tempo."
    $DC logs redis --tail=30 || true
    exit 1
fi

# ── Aguarda MinIO ────────────────────────────────────────
echo -n "   Aguardando MinIO..."
MINIO_READY=0
for i in $(seq 1 20); do
    if $DC exec -T minio curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
        echo -e " ${GREEN}[READY]${RESET}"
        MINIO_READY=1
        break
    fi
    sleep 3
    echo -n "."
done
if [ "$MINIO_READY" -eq 0 ]; then
    echo ""
    err "MinIO nao ficou pronto a tempo."
    $DC logs minio --tail=30 || true
    exit 1
fi

info "Garantindo bucket do MinIO..."
$DC up -d createbuckets > /dev/null 2>&1
progress "MINIO BUCKET" 3

# ── Garante role/database no Postgres ───────────────────
DB_PASS_ESC="${DB_PASS_CHECK//\'/\'\'}"
$DC exec -T db sh -c "
set -e
ADMIN_DB='template1'
ADMIN_USER='${DB_USER_CHECK}'

if ! psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c 'SELECT 1' >/dev/null 2>&1; then
  if psql -U postgres -d \"\$ADMIN_DB\" -c 'SELECT 1' >/dev/null 2>&1; then
    ADMIN_USER='postgres'
  else
    echo 'ERRO: nao foi possivel autenticar no Postgres.'
    exit 1
  fi
fi

psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -tc \
  \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER_CHECK}'\" | grep -q 1 || \
  psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c \
  \"CREATE ROLE \\\"${DB_USER_CHECK}\\\" LOGIN PASSWORD '${DB_PASS_ESC}';\"

psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -tc \
  \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME_CHECK}'\" | grep -q 1 || \
  psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c \
  \"CREATE DATABASE \\\"${DB_NAME_CHECK}\\\" OWNER \\\"${DB_USER_CHECK}\\\";\"
"

# ══════════════════════════════════════════════════════════
# FASE 4: MIGRATIONS
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 4: SINCRONIZACAO DE SCHEMA${RESET}"
echo -n "   Executando migracoes..."
if ! $DC run --rm backend python manage.py migrate --no-input > logs/migrate.log 2>&1; then
    echo ""
    err "Falha na migracao! Veja logs/migrate.log"
    tail -n 30 logs/migrate.log || true
    exit 1
fi
progress "MIGRATIONS" 3
ok "Banco sincronizado"
echo ""

# ══════════════════════════════════════════════════════════
# FASE 5: SUBIR APLICACAO
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 5: STARTUP DA APLICACAO${RESET}"
$DC up -d pgbouncer backend celery_worker celery_beat frontend \
         flower prometheus grafana > /dev/null 2>&1
progress "STARTING SERVICES" 5
ok "Containers iniciados. Aguardando healthchecks..."
echo ""

# ══════════════════════════════════════════════════════════
# FASE 6: HEALTH CHECKS
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 6: VERIFICACAO DE INTEGRIDADE${RESET}"

# Backend
echo -n "   Aguardando backend..."
BACKEND_UP=0
for i in $(seq 1 45); do
    if curl -sf http://127.0.0.1:8005/api/health/ > /dev/null 2>&1; then
        echo -e " ${GREEN}[ONLINE]${RESET}"
        BACKEND_UP=1
        break
    fi
    sleep 2
    echo -n "."
done
if [ "$BACKEND_UP" -eq 0 ]; then
    echo ""
    err "Backend nao respondeu em 90s!"
    $DC logs backend --tail=80
    exit 1
fi

# Frontend
echo -n "   Aguardando frontend..."
FRONTEND_UP=0
for i in $(seq 1 60); do
    if curl -sf http://127.0.0.1:3005/api/health > /dev/null 2>&1; then
        echo -e " ${GREEN}[ONLINE]${RESET}"
        FRONTEND_UP=1
        break
    fi
    sleep 2
    echo -n "."
done
if [ "$FRONTEND_UP" -eq 0 ]; then
    echo ""
    err "Frontend nao respondeu em 120s!"
    $DC logs frontend --tail=80
    exit 1
fi

# ══════════════════════════════════════════════════════════
# FASE 7: POPULACAO DE DADOS
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 7: POPULACAO DE DADOS${RESET}"
echo "   Populando tabelas base..."
# Usando a variável $DC que já contém --env-file .env.prod
$DC exec backend python manage.py seed_system
$DC exec backend python manage.py seed_crm
$DC exec backend python manage.py seed_pages
progress "SEEDING" 3
ok "Dados populados com sucesso"
echo ""

# Cleanup de imagens antigas
info "Limpando imagens nao utilizadas..."
docker image prune -f > /dev/null 2>&1 || true

# ══════════════════════════════════════════════════════════
# FASE 7: FINALIZACAO
# ══════════════════════════════════════════════════════════
echo ""
echo -e "${WHITE}:: FASE 7: FINALIZACAO${RESET}"
ok "Deploy realizado com sucesso!"
echo ""
echo -e "${GREEN}   Backend  -> http://127.0.0.1:8005/api/health/${RESET}"
echo -e "${GREEN}   Frontend -> http://127.0.0.1:3005${RESET}"
echo -e "${GREEN}   Grafana  -> http://127.0.0.1:3001${RESET}"
echo -e "${GREEN}   Flower   -> http://127.0.0.1:5555${RESET}"
echo -e "${GREEN}   Tunnel   -> verifique o Cloudflare Dashboard${RESET}"
echo ""
echo -e "${GREEN}${BOLD}DEPLOY CONCLUIDO COM SUCESSO.${RESET}"
echo ""
