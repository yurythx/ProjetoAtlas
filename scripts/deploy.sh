#!/bin/bash
# ============================================================
# ATLAS — Script de Deploy (Matrix Theme)
# ============================================================
# Uso:
#   ./scripts/deploy.sh
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
BLACK_BG='\033[48;5;0m'      # Black Background
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
    echo " ║   ░▀▀░░▀░▀░▀▀▀░▀░▀░▀▀░░▀▀▀░▀░▀░▀▀▀   DEPLOY SYSTEM v2.0    ║"
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
    
    # Barra estilo Matrix
    printf "\r${NEON_GREEN}  [${container}] "
    printf "%${filled}s" '' | tr ' ' '█'
    printf "${DARK_GREEN}%${empty}s" '' | tr ' ' '░'
    printf "${NEON_GREEN}] ${percent}%%${RESET}"
}

simulate_loading() {
    local container=$1
    local duration=$2
    local steps=20
    local sleep_time=$(awk "BEGIN {print $duration / $steps}")
    
    for ((i=1; i<=steps; i++)); do
        show_progress "$container" "$i" "$steps"
        sleep "$sleep_time"
    done
    echo ""
}

# ── Início do Script ─────────────────────────────────────────

matrix_header
mkdir -p logs

# 0. Pré-requisitos
echo -e "${WHITE}:: FASE 0: VERIFICAÇÃO DE SISTEMA${RESET}"

if ! command -v docker &> /dev/null; then
    echo -e "${NEON_GREEN}   [ERROR] Docker não encontrado!${RESET}"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo -e "${NEON_GREEN}   [ERROR] Git não encontrado!${RESET}"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo -e "${NEON_GREEN}   [ERROR] curl não encontrado! Instale com: apt-get install -y curl${RESET}"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${NEON_GREEN}   [ERROR] Arquivo $ENV_FILE não encontrado!${RESET}"
    exit 1
fi

if ! $DC config > logs/compose_config.log 2>&1; then
    echo -e "${NEON_GREEN}   [ERROR] Falha ao validar docker compose. Verifique logs/compose_config.log${RESET}"
    tail -n 20 logs/compose_config.log || true
    exit 1
fi

echo -e "${NEON_GREEN}   ✔ Sistema pronto para deploy${RESET}\n"

# 1. Backup
echo -e "${WHITE}:: FASE 1: PRESERVAÇÃO DE DADOS${RESET}"
mkdir -p ./backups
BACKUP_FILE="./backups/backup_$(date +%F_%H-%M-%S).sql"

# Tenta fazer backup apenas se o DB estiver rodando
# Use SKIP_BACKUP=1 para o primeiro deploy (quando o banco ainda não existe)
if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then
    echo -e "${DARK_GREEN}   ⚠ SKIP_BACKUP=1 detectado, backup ignorado (modo primeiro deploy).${RESET}\n"
elif $DC ps db 2>/dev/null | grep -q "Up"; then
    DB_USER="$(awk -F= '/^POSTGRES_USER=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs || echo "atlas_user")"
    DB_NAME="$(awk -F= '/^POSTGRES_DB=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs || echo "atlas_prod")"
    
    $DC exec -T db pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE" 2>> logs/deploy_error.log || true
    simulate_loading "BACKUP DATABASE" 2
    echo -e "${NEON_GREEN}   ✔ Backup realizado: $(basename $BACKUP_FILE)${RESET}\n"
else
    simulate_loading "SKIPPING BACKUP (DB OFF)" 1
    echo -e "${DARK_GREEN}   ⚠ Banco de dados offline, backup pulado.${RESET}\n"
fi

# 2. Pull
echo -e "${WHITE}:: FASE 2: SINCRONIZAÇÃO DE CÓDIGO${RESET}"
git pull origin main > logs/git_pull.log 2>&1
if [ $? -ne 0 ]; then
    echo -e "${NEON_GREEN}   [ERROR] Falha no git pull. Verifique logs/git_pull.log${RESET}"
    exit 1
fi
simulate_loading "GIT PULL ORIGIN" 3
echo -e "${NEON_GREEN}   ✔ Repositório atualizado para a última versão${RESET}\n"

# ── Log Wrapper ─────────────────────────────────────────────
log_box() {
    local title=$1
    echo -e "${NEON_GREEN} ╔═ ${WHITE}${title} ${NEON_GREEN}"$(printf '═%.0s' $(seq 1 $((54 - ${#title}))))"╗"
    while IFS= read -r line; do
        # Truncate or pad line to fix width (approx 58 chars)
        local formatted_line=$(echo "$line" | cut -c1-58)
        printf "${NEON_GREEN} ║ ${GRAY}%-58s ${NEON_GREEN}║\n" "$formatted_line"
    done
    echo -e " ╚"$(printf '═%.0s' $(seq 1 60))"╝${RESET}"
}

# 3. Orquestração de Containers
echo -e "${WHITE}:: FASE 3: ORQUESTRAÇÃO DE CONTAINERS${RESET}"

# Build ou Pull
if [[ "${1:-}" == "--pull" ]]; then
    echo -e "${GRAY}   Baixando imagens do registro externo...${RESET}"
    $DC pull 2>&1 | log_box "PULLING IMAGES"
    simulate_loading "PULLING IMAGES" 2
else
    echo -e "${GRAY}   Construindo imagens (BuildKit)...${RESET}"
    # Armazenamos o log completo mas mostramos na caixa
    (COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 $DC build --no-cache 2>&1) | tee logs/build.log | log_box "DOCKER BUILD"
    
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo -e "\n${NEON_GREEN}   [ERROR] Falha no build. Verifique logs/build.log${RESET}"
        exit 1
    fi
    simulate_loading "BUILDING IMAGES" 2
fi

# 3.1 Infraestrutura básica (DB, Redis e MinIO)
echo -e "${GRAY}   Iniciando infraestrutura básica...${RESET}"
$DC up -d db redis minio >/dev/null 2>&1
simulate_loading "INFRA: DB, REDIS & MINIO" 4

# Aguarda DB ficar saudável
echo -n "   Aguardando DB..."
DB_READY=0
for i in {1..20}; do
    DB_USER_CHECK="$(awk -F= '/^POSTGRES_USER=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs)"
    DB_NAME_CHECK="$(awk -F= '/^POSTGRES_DB=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs)"
    if $DC exec -T db pg_isready -U "$DB_USER_CHECK" -d "$DB_NAME_CHECK" >/dev/null 2>&1; then
        echo -e "${NEON_GREEN} [READY]${RESET}"
        DB_READY=1
        break
    fi
    sleep 1
    echo -n "."
done

if [[ "$DB_READY" -ne 1 ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] DB não ficou pronto a tempo. Verifique logs do container db.${RESET}"
    $DC logs db --tail=200 || true
    exit 1
fi

# Garante bucket do MinIO (serviço roda apenas uma vez e sai)
echo -e "${GRAY}   Garantindo bucket do MinIO...${RESET}"
$DC up -d createbuckets >/dev/null 2>&1
simulate_loading "MINIO BUCKETS" 2

# Garante usuário e banco consistentes (evita erros por whitespace/mismatch em .env)
DB_USER_CHECK="$(awk -F= '/^POSTGRES_USER=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs)"
DB_NAME_CHECK="$(awk -F= '/^POSTGRES_DB=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs)"
DB_PASS_CHECK="$(awk -F= '/^POSTGRES_PASSWORD=/{print $2}' "$ENV_FILE" | tr -d '\"\r' | xargs)"

if [[ -z "$DB_USER_CHECK" || -z "$DB_NAME_CHECK" || -z "$DB_PASS_CHECK" ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] POSTGRES_USER/POSTGRES_DB/POSTGRES_PASSWORD ausentes ou inválidos no $ENV_FILE${RESET}"
    exit 1
fi

if [[ "$DB_USER_CHECK" =~ [[:space:]] || "$DB_NAME_CHECK" =~ [[:space:]] ]]; then
    echo -e "\n${NEON_GREEN}   [ERROR] POSTGRES_USER/POSTGRES_DB contém espaços. Corrija o $ENV_FILE (remova espaços extras).${RESET}"
    exit 1
fi

DB_PASS_ESCAPED="${DB_PASS_CHECK//\'/\'\'}"
$DC exec -T db sh -lc "
set -e

ADMIN_DB='template1'
ADMIN_USER='${DB_USER_CHECK}'

if ! psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c 'SELECT 1' >/dev/null 2>&1; then
  if psql -U postgres -d \"\$ADMIN_DB\" -c 'SELECT 1' >/dev/null 2>&1; then
    ADMIN_USER='postgres'
  else
    echo 'Não foi possível autenticar no Postgres. Verifique POSTGRES_USER/POSTGRES_PASSWORD e se o volume do db não foi inicializado com outro usuário.'
    exit 1
  fi
fi

psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -tc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER_CHECK}'\" | grep -q 1 || \
  psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c \"CREATE ROLE \\\"${DB_USER_CHECK}\\\" LOGIN PASSWORD '${DB_PASS_ESCAPED}';\"

psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -tc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME_CHECK}'\" | grep -q 1 || \
  psql -U \"\$ADMIN_USER\" -d \"\$ADMIN_DB\" -c \"CREATE DATABASE \\\"${DB_NAME_CHECK}\\\" OWNER \\\"${DB_USER_CHECK}\\\";\"
"

# 3.2 Migrações (ANTES de subir o backend principal)
echo -e "${WHITE}:: FASE 4: SINCRONIZAÇÃO DE SCHEMA${RESET}"
echo -n "   Executando migrações..."
$DC run --rm backend python manage.py migrate --no-input > logs/migrate.log 2>&1
if [ $? -ne 0 ]; then
    echo -e "\n${NEON_GREEN}   [ERROR] Falha na migração! Verifique logs/migrate.log${RESET}"
    exit 1
fi
simulate_loading "DATABASE MIGRATIONS" 3
echo -e "${NEON_GREEN}   ✔ Banco de dados sincronizado${RESET}\n"

# 3.3 Arquivos estáticos (ANTES de subir o backend, para que já estejam disponíveis)
echo -e "${WHITE}:: FASE 5: STARTUP DA APLICAÇÃO${RESET}"
echo -n "   Coletando arquivos estáticos..."
$DC run --rm backend python manage.py collectstatic --noinput > /dev/null 2>&1
simulate_loading "STATIC FILES" 2
echo -e "${NEON_GREEN}   ✔ Assets compilados${RESET}\n"

# 3.4 Subir Aplicação
# Subir aplicação (tunnel por último — depende de health do backend/frontend)
$DC up -d backend celery_worker celery_beat frontend > /dev/null 2>&1
simulate_loading "STARTING APP SERVICES" 5

echo -e "${NEON_GREEN}   ✔ Todos os containers operacionais.${RESET}\n"

# 4. Health Check
echo -e "${WHITE}:: FASE 6: VERIFICAÇÃO DE INTEGRIDADE${RESET}"
echo -n "   Aguardando API..."
for i in {1..15}; do
    if curl -sf http://localhost:8005/api/core/health/ >/dev/null 2>&1; then
        echo -e "${NEON_GREEN} [ONLINE]${RESET}"
        break
    fi
    sleep 2
    echo -n "."
    if [ $i -eq 15 ]; then
        echo -e "\n${NEON_GREEN}   [ERROR] Backend não respondeu a tempo!${RESET}"
        $DC logs backend --tail=50
        exit 1
    fi
done

echo -n "   Aguardando Frontend..."
for i in {1..30}; do
    if curl -sf http://localhost:3005/api/health >/dev/null 2>&1; then
        echo -e "${NEON_GREEN} [ONLINE]${RESET}"
        break
    fi
    sleep 2
    echo -n "."
    if [ $i -eq 30 ]; then
        echo -e "\n${NEON_GREEN}   [ERROR] Frontend não respondeu a tempo!${RESET}"
        $DC logs frontend --tail=80
        exit 1
    fi
done

echo -e "${GRAY}   Iniciando Cloudflare Tunnel...${RESET}"
$DC up -d cloudflared >/dev/null 2>&1
simulate_loading "CLOUDFLARE TUNNEL" 2

# 5. Finalização
echo -e "${WHITE}:: FASE 7: FINALIZAÇÃO${RESET}"
echo -e "${NEON_GREEN}   ✔ Deploy realizado com sucesso!${RESET}"
echo ""

echo -e "${NEON_GREEN}${BOLD}DEPLOY CONCLUÍDO COM SUCESSO.${RESET}"
echo -e "${DARK_GREEN}Siga o coelho branco...${RESET}"
echo ""
