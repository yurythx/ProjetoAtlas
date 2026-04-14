#!/bin/bash
# ============================================================
# ATLAS — Script de Deploy (Matrix Theme)
# ============================================================
# Uso:
#   ./scripts/deploy.sh           # Build local + deploy
#   ./scripts/deploy.sh --pull    # Pull imagens do GHCR + deploy
#   SKIP_BACKUP=1 ./scripts/deploy.sh  # Primeiro deploy (sem backup)
# ============================================================

set -Eeuo pipefail

# ── Error Handler ───────────────────────────────────────────
error_handler() {
    local line=$1
    echo -e "\n${NEON_GREEN}${BOLD}   [FATAL] Erro na linha ${line}. Abortando deploy.${RESET}" >&2
    echo -e "${DARK_GREEN}   Verifique os logs em ./logs/ para detalhes.${RESET}" >&2
    exit 1
}
trap 'error_handler $LINENO' ERR

# ── Cores Matrix (Verde Neon e Preto) ───────────────────────
RESET='\033[0m'
BOLD='\033[1m'
NEON_GREEN='\033[38;5;46m'   # Matrix Green
DARK_GREEN='\033[38;5;22m'   # Darker Green
WHITE='\033[38;5;15m'        # White text for contrast
GRAY='\033[38;5;240m'        # Gray for logs

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.prod"
DC="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# ── Funções de Estilo ───────────────────────────────────────

matrix_header() {
    clear
    echo -e "${NEON_GREEN}${BOLD}"
    echo " ╔════════════════════════════════════════════════════════════╗"
    echo " ║                                                            ║"
    echo " ║   ░█▀▄░█▀█░█▀▀░█░█░█▀▄░█▀█░█▀█░█▀▀                         ║"
    echo " ║   ░█▀▄░█▀█░█░░░█▀▄░█▀▄░█░█░█░█░█▀▀                         ║"
    echo " ║   ░▀▀░░▀░▀░▀▀▀░▀░▀░▀▀░░▀▀▀░▀░▀░▀▀▀   DEPLOY SYSTEM v2.1    ║"
    echo " ║                                                            ║"
    echo " ╚════════════════════════════════════════════════════════════╝"
    echo -e "${RESET}"
    echo -e "${DARK_GREEN}  > INICIANDO SEQUÊNCIA DE DEPLOY...${RESET}"
    echo -e "${DARK_GREEN}  > TARGET: ${ENV_FILE}${RESET}"
    echo ""
}

show_progress() {
    local container=$1
    local current=$2
    local total=$3
    local width=40
    local percent=$((current * 100 / total))
    local filled=$((percent * width / 100))
    local empty=$((width - filled))

    printf "\r${NEON_GREEN}  [${container}] "
    printf "%${filled}s" '' | tr ' ' '█'
    printf "${DARK_GREEN}%${empty}s" '' | tr ' ' '░'
    printf "${NEON_GREEN}] ${percent}%%${RESET}"
}

simulate_loading() {
    local container=$1
    local duration=$2
    local steps=20
    local sleep_time
    sleep_time=$(awk "BEGIN {print $duration / $steps}")

    for ((i=1; i<=steps; i++)); do
        show_progress "$container" "$i" "$steps"
        sleep "$sleep_time"
    done
    echo ""
}

# ── Lê variável do .env corretamente (suporta senhas com '=') ──
# Uso: get_env VAR_NAME  (retorna o valor da variável)
get_env() {
    local key="$1"
    # grep pega a linha, cut divide apenas na PRIMEIRA ocorrência de '='
    grep -E "^${key}=" "$ENV_FILE" \
        | head -1 \
        | cut -d'=' -f2- \
        | tr -d '"' \
        | tr -d $'\r' \
        | xargs
}

# ── Log Wrapper ─────────────────────────────────────────────
log_box() {
    local title=$1
    echo -e "${NEON_GREEN} ╔═ ${WHITE}${title} ${NEON_GREEN}"$(printf '═%.0s' $(seq 1 $((54 - ${#title}))))""╗"
    while IFS= read -r line; do
        local formatted_line
        formatted_line=$(echo "$line" | cut -c1-58)
        printf "${NEON_GREEN} ║ ${GRAY}%-58s ${NEON_GREEN}║\n" "$formatted_line"
    done
    echo -e " ╚"$(printf '═%.0s' $(seq 1 60))"╝${RESET}"
}

# ── Início do Script ─────────────────────────────────────────

matrix_header
mkdir -p logs

# ══════════════════════════════════════════════════════════
# FASE 0: VERIFICAÇÃO DE SISTEMA
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 0: VERIFICAÇÃO DE SISTEMA${RESET}"

for cmd in docker git curl awk; do
    if ! command -v "$cmd" &>/dev/null; then
        echo -e "${NEON_GREEN}   [ERROR] '${cmd}' não encontrado. Instale e tente novamente.${RESET}"
        exit 1
    fi
done

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${NEON_GREEN}   [ERROR] Arquivo $ENV_FILE não encontrado!${RESET}"
    echo -e "${DARK_GREEN}   Dica: cp .env.prod.example .env.prod && preencha os CHANGE_ME${RESET}"
    exit 1
fi

# Valida variáveis obrigatórias no .env.prod antes de qualquer operação
REQUIRED_VARS=(
    SECRET_KEY FIELD_ENCRYPTION_KEY
    POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL
    REDIS_PASSWORD REDIS_URL
    MINIO_ROOT_USER MINIO_ROOT_PASSWORD
    AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
    ALLOWED_HOSTS CORS_ALLOWED_ORIGINS CSRF_TRUSTED_ORIGINS
    NEXT_PUBLIC_API_URL TUNNEL_TOKEN
)
MISSING=0
for var in "${REQUIRED_VARS[@]}"; do
    val="$(get_env "$var")"
    if [[ -z "$val" || "$val" == *"CHANGE_ME"* ]]; then
        echo -e "${NEON_GREEN}   [ERROR] Variável ${var} ausente ou ainda com CHANGE_ME no ${ENV_FILE}${RESET}"
        MISSING=1
    fi
done
if [[ "$MISSING" -eq 1 ]]; then
    echo -e "${NEON_GREEN}   [ERROR] Preencha as variáveis acima antes de continuar.${RESET}"
    exit 1
fi

# Valida o docker-compose antes de qualquer operação
if ! $DC config > logs/compose_config.log 2>&1; then
    echo -e "${NEON_GREEN}   [ERROR] Falha ao validar docker compose. Verifique logs/compose_config.log${RESET}"
    tail -n 20 logs/compose_config.log || true
    exit 1
fi

echo -e "${NEON_GREEN}   ✔ Sistema pronto para deploy${RESET}\n"

# ══════════════════════════════════════════════════════════
# FASE 1: PRESERVAÇÃO DE DADOS (Backup)
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 1: PRESERVAÇÃO DE DADOS${RESET}"
mkdir -p ./backups
BACKUP_FILE="./backups/backup_$(date +%F_%H-%M-%S).sql"

if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then
    echo -e "${DARK_GREEN}   ⚠ SKIP_BACKUP=1 detectado, backup ignorado (modo primeiro deploy).${RESET}\n"
elif $DC ps db --status=running 2>/dev/null | grep -q "atlas_db"; then
    DB_USER="$(get_env POSTGRES_USER)"
    DB_NAME="$(get_env POSTGRES_DB)"

    if $DC exec -T db pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>>logs/deploy_error.log; then
        simulate_loading "BACKUP DATABASE" 2
        echo -e "${NEON_GREEN}   ✔ Backup realizado: $(basename "$BACKUP_FILE")${RESET}\n"
    else
        echo -e "${DARK_GREEN}   ⚠ Backup falhou (pg_dump). Deploy continua, mas verifique logs/deploy_error.log${RESET}\n"
    fi
else
    simulate_loading "SKIPPING BACKUP (DB OFF)" 1
    echo -e "${DARK_GREEN}   ⚠ Banco de dados offline, backup pulado.${RESET}\n"
fi

# ══════════════════════════════════════════════════════════
# FASE 2: SINCRONIZAÇÃO DE CÓDIGO
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 2: SINCRONIZAÇÃO DE CÓDIGO${RESET}"
if ! git pull origin main > logs/git_pull.log 2>&1; then
    echo -e "${NEON_GREEN}   [ERROR] Falha no git pull. Verifique logs/git_pull.log${RESET}"
    exit 1
fi
simulate_loading "GIT PULL ORIGIN" 3
echo -e "${NEON_GREEN}   ✔ Repositório atualizado para a última versão${RESET}\n"

# ══════════════════════════════════════════════════════════
# FASE 3: BUILD / PULL DE IMAGENS
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 3: ORQUESTRAÇÃO DE CONTAINERS${RESET}"

if [[ "${1:-}" == "--pull" ]]; then
    echo -e "${GRAY}   Baixando imagens do registro externo...${RESET}"
    $DC pull 2>&1 | log_box "PULLING IMAGES"
    simulate_loading "PULLING IMAGES" 2
else
    echo -e "${GRAY}   Construindo imagens (BuildKit)...${RESET}"
    # FIX: Salvar exit code em arquivo para evitar problema com PIPESTATUS em subshell
    BUILD_STATUS_FILE=$(mktemp)
    (
        COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 \
        $DC build --no-cache 2>&1
        echo "$?" > "$BUILD_STATUS_FILE"
    ) | tee logs/build.log | log_box "DOCKER BUILD"

    BUILD_EXIT=$(cat "$BUILD_STATUS_FILE" 2>/dev/null || echo "1")
    rm -f "$BUILD_STATUS_FILE"

    if [[ "$BUILD_EXIT" -ne 0 ]]; then
        echo -e "\n${NEON_GREEN}   [ERROR] Falha no build. Verifique logs/build.log${RESET}"
        exit 1
    fi
    simulate_loading "BUILDING IMAGES" 2
fi

# ══════════════════════════════════════════════════════════
# FASE 3.1: INFRAESTRUTURA BÁSICA (DB, Redis, MinIO)
# ══════════════════════════════════════════════════════════
echo -e "${GRAY}   Iniciando infraestrutura básica...${RESET}"
$DC up -d db redis minio > /dev/null 2>&1
simulate_loading "INFRA: DB, REDIS & MINIO" 4

# ── Aguarda DB ──────────────────────────────────────────
echo -n "   Aguardando DB..."
DB_USER_CHECK="$(get_env POSTGRES_USER)"
DB_NAME_CHECK="$(get_env POSTGRES_DB)"
DB_PASS_CHECK="$(get_env POSTGRES_PASSWORD)"

if [[ -z "$DB_USER_CHECK" || -z "$DB_NAME_CHECK" || -z "$DB_PASS_CHECK" ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD ausentes no $ENV_FILE${RESET}"
    exit 1
fi

if [[ "$DB_USER_CHECK" =~ [[:space:]] || "$DB_NAME_CHECK" =~ [[:space:]] ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] POSTGRES_USER/POSTGRES_DB contém espaços. Corrija o $ENV_FILE.${RESET}"
    exit 1
fi

DB_READY=0
for i in {1..30}; do
    if $DC exec -T db pg_isready -U "$DB_USER_CHECK" -d "$DB_NAME_CHECK" > /dev/null 2>&1; then
        echo -e "${NEON_GREEN} [READY]${RESET}"
        DB_READY=1
        break
    fi
    sleep 2
    echo -n "."
done

if [[ "$DB_READY" -ne 1 ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] DB não ficou pronto a tempo. Logs:${RESET}"
    $DC logs db --tail=50 || true
    exit 1
fi

# ── Aguarda Redis ────────────────────────────────────────
echo -n "   Aguardando Redis..."
REDIS_PASS_CHECK="$(get_env REDIS_PASSWORD)"
REDIS_READY=0
for i in {1..20}; do
    if $DC exec -T redis redis-cli -a "$REDIS_PASS_CHECK" ping > /dev/null 2>&1; then
        echo -e "${NEON_GREEN} [READY]${RESET}"
        REDIS_READY=1
        break
    fi
    sleep 2
    echo -n "."
done

if [[ "$REDIS_READY" -ne 1 ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] Redis não ficou pronto a tempo. Logs:${RESET}"
    $DC logs redis --tail=30 || true
    exit 1
fi

# ── Aguarda MinIO e garante bucket ───────────────────────
echo -n "   Aguardando MinIO..."
MINIO_READY=0
for i in {1..20}; do
    if $DC exec -T minio curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
        echo -e "${NEON_GREEN} [READY]${RESET}"
        MINIO_READY=1
        break
    fi
    sleep 3
    echo -n "."
done

if [[ "$MINIO_READY" -ne 1 ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] MinIO não ficou pronto a tempo. Logs:${RESET}"
    $DC logs minio --tail=30 || true
    exit 1
fi

echo -e "${GRAY}   Garantindo bucket do MinIO...${RESET}"
$DC up -d createbuckets > /dev/null 2>&1
simulate_loading "MINIO BUCKETS" 3

# ── Garante role/banco consistentes no Postgres ──────────
DB_PASS_ESCAPED="${DB_PASS_CHECK//\'/\'\'}"
$DC exec -T db sh -lc "
set -e

ADMIN_DB='template1'
ADMIN_USER='${DB_USER_CHECK}'

if ! psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c 'SELECT 1' >/dev/null 2>&1; then
  if psql -U postgres -d \"\$ADMIN_DB\" -c 'SELECT 1' >/dev/null 2>&1; then
    ADMIN_USER='postgres'
  else
    echo 'Erro: não foi possível autenticar no Postgres. Verifique POSTGRES_USER/POSTGRES_PASSWORD.'
    exit 1
  fi
fi

psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER_CHECK}'\" | grep -q 1 || \
  psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c \"CREATE ROLE \\\"${DB_USER_CHECK}\\\" LOGIN PASSWORD '${DB_PASS_ESCAPED}';\"

psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME_CHECK}'\" | grep -q 1 || \
  psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c \"CREATE DATABASE \\\"${DB_NAME_CHECK}\\\" OWNER \\\"${DB_USER_CHECK}\\\";\"
"

# ══════════════════════════════════════════════════════════
# FASE 4: SINCRONIZAÇÃO DE SCHEMA (Migrations)
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 4: SINCRONIZAÇÃO DE SCHEMA${RESET}"
echo -n "   Executando migrações..."
if ! $DC run --rm backend python manage.py migrate --no-input > logs/migrate.log 2>&1; then
    echo -e "\n${NEON_GREEN}   [ERROR] Falha na migração! Verifique logs/migrate.log${RESET}"
    tail -n 30 logs/migrate.log || true
    exit 1
fi
simulate_loading "DATABASE MIGRATIONS" 3
echo -e "${NEON_GREEN}   ✔ Banco de dados sincronizado${RESET}\n"

# ══════════════════════════════════════════════════════════
# FASE 5: STARTUP DA APLICAÇÃO
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 5: STARTUP DA APLICAÇÃO${RESET}"

# NOTA: collectstatic não é executado aqui.
# O Dockerfile já roda 'collectstatic --noinput --clear' durante o build (stage runtime).
# Executar novamente em produção seria redundante e poderia falhar se o MinIO
# ainda não estiver completamente autenticado para o usuário de app.

$DC up -d backend celery_worker celery_beat frontend > /dev/null 2>&1
simulate_loading "STARTING APP SERVICES" 5
echo -e "${NEON_GREEN}   ✔ Containers iniciados. Aguardando healthchecks...${RESET}\n"

# ══════════════════════════════════════════════════════════
# FASE 6: VERIFICAÇÃO DE INTEGRIDADE
# ══════════════════════════════════════════════════════════
echo -e "${WHITE}:: FASE 6: VERIFICAÇÃO DE INTEGRIDADE${RESET}"

# Backend — timeout de 90s para acomodar o start_period: 60s do healthcheck
echo -n "   Aguardando API (backend)..."
BACKEND_UP=0
for i in {1..45}; do
    if curl -sf http://127.0.0.1:8005/api/core/health/ > /dev/null 2>&1; then
        echo -e "${NEON_GREEN} [ONLINE]${RESET}"
        BACKEND_UP=1
        break
    fi
    sleep 2
    echo -n "."
done

if [[ "$BACKEND_UP" -ne 1 ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] Backend não respondeu após 90s!${RESET}"
    $DC logs backend --tail=80
    exit 1
fi

# Frontend — timeout de 120s para acomodar o start_period: 180s do docker-compose
echo -n "   Aguardando Frontend..."
FRONTEND_UP=0
for i in {1..60}; do
    if curl -sf http://127.0.0.1:3005/api/health > /dev/null 2>&1; then
        echo -e "${NEON_GREEN} [ONLINE]${RESET}"
        FRONTEND_UP=1
        break
    fi
    sleep 2
    echo -n "."
done

if [[ "$FRONTEND_UP" -ne 1 ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] Frontend não respondeu após 120s!${RESET}"
    $DC logs frontend --tail=80
    exit 1
fi

# ── Cloudflare Tunnel (por último — depende de backend + frontend saudáveis) ──
echo -e "${GRAY}   Iniciando Cloudflare Tunnel...${RESET}"
$DC up -d cloudflared > /dev/null 2>&1
simulate_loading "CLOUDFLARE TUNNEL" 3

# ── Limpeza de imagens antigas ──────────────────────────
echo -e "${GRAY}   Limpando imagens não utilizadas...${RESET}"
docker image prune -f > /dev/null 2>&1 || true

# ══════════════════════════════════════════════════════════
# FASE 7: FINALIZAÇÃO
# ══════════════════════════════════════════════════════════
echo ""
echo -e "${WHITE}:: FASE 7: FINALIZAÇÃO${RESET}"
echo -e "${NEON_GREEN}   ✔ Deploy realizado com sucesso!${RESET}"
echo ""
echo -e "${NEON_GREEN}   Backend  → http://127.0.0.1:8005/api/core/health/${RESET}"
echo -e "${NEON_GREEN}   Frontend → http://127.0.0.1:3005${RESET}"
echo -e "${NEON_GREEN}   Tunnel   → verifique o Cloudflare Dashboard${RESET}"
echo ""
echo -e "${NEON_GREEN}${BOLD}DEPLOY CONCLUÍDO COM SUCESSO.${RESET}"
echo -e "${DARK_GREEN}Siga o coelho branco...${RESET}"
echo ""
