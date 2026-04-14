#!/bin/bash

# Backup Script for Atlas SaaS
# Backs up PostgreSQL database and MinIO storage
# Usage: ./backup.sh [backup_name]

set -euo pipefail  # Exit on error, unset vars, pipe failures

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${1:-backup_${TIMESTAMP}}"

# Detect env file (prefer .env.prod, fallback to .env)
ENV_FILE="${ENV_FILE:-.env.prod}"
if [ ! -f "$ENV_FILE" ]; then
    ENV_FILE=".env"
fi

# Carregar credenciais do env file
DB_USER="$(awk -F= '/^POSTGRES_USER=/{print $2}' "$ENV_FILE" 2>/dev/null | tr -d '"\r' | xargs || echo "atlas_user")"
DB_NAME="$(awk -F= '/^POSTGRES_DB=/{print $2}' "$ENV_FILE" 2>/dev/null | tr -d '"\r' | xargs || echo "atlas_prod")"
MINIO_USER="$(awk -F= '/^MINIO_ROOT_USER=/{print $2}' "$ENV_FILE" 2>/dev/null | tr -d '"\r' | xargs || echo "minioadmin")"
MINIO_PASS="$(awk -F= '/^MINIO_ROOT_PASSWORD=/{print $2}' "$ENV_FILE" 2>/dev/null | tr -d '"\r' | xargs || echo "minioadmin")"
BUCKET_NAME="$(awk -F= '/^AWS_STORAGE_BUCKET_NAME=/{print $2}' "$ENV_FILE" 2>/dev/null | tr -d '"\r' | xargs || echo "atlas-media")"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Create backup directory
mkdir -p "${BACKUP_DIR}/${BACKUP_NAME}"
cd "${BACKUP_DIR}/${BACKUP_NAME}"

log_info "Starting backup: ${BACKUP_NAME}"
log_info "Backup directory: ${BACKUP_DIR}/${BACKUP_NAME}"

# 1. Backup PostgreSQL
log_info "Backing up PostgreSQL database..."

if command -v docker &> /dev/null; then
    # Prefer 'docker compose' (v2) over deprecated 'docker-compose' (v1)
    if docker compose version &>/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    fi

    if [ -n "${COMPOSE_CMD:-}" ]; then
        $COMPOSE_CMD exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > postgres_${TIMESTAMP}.sql.gz
    else
        CONTAINER_ID=$(docker ps --filter "name=atlas_db" --format "{{.ID}}" | head -n 1)
        if [ -z "$CONTAINER_ID" ]; then
            log_error "PostgreSQL container not found!"
            exit 1
        fi
        docker exec -t $CONTAINER_ID pg_dump -U "$DB_USER" "$DB_NAME" | gzip > postgres_${TIMESTAMP}.sql.gz
    fi

    if [ $? -eq 0 ]; then
        log_info "✓ PostgreSQL backup completed: postgres_${TIMESTAMP}.sql.gz"
    else
        log_error "✗ PostgreSQL backup failed!"
        exit 1
    fi
else
    log_error "Docker not found! Cannot backup database."
    exit 1
fi

# 2. Backup MinIO/S3 Storage
log_info "Backing up MinIO storage..."

if command -v mc &> /dev/null; then
    # Configure mc alias
    mc alias set atlas-minio http://localhost:9000 "$MINIO_USER" "$MINIO_PASS" 2>/dev/null || true
    
    # Mirror bucket to backup directory
    mc mirror atlas-minio/${BUCKET_NAME} ./minio_backup
    
    # Create tar.gz archive
    tar -czf minio_${TIMESTAMP}.tar.gz minio_backup
    rm -rf minio_backup
    
    log_info "✓ MinIO backup completed: minio_${TIMESTAMP}.tar.gz"
else
    log_warning "MinIO client (mc) not installed. Skipping MinIO backup."
    log_warning "Install with: curl https://dl.min.io/client/mc/release/linux-amd64/mc --create-dirs -o /usr/local/bin/mc && chmod +x /usr/local/bin/mc"
fi

# 3. Backup .env files (for disaster recovery)
log_info "Backing up configuration files..."

if [ -f "../../backend/.env" ]; then
    cp ../../backend/.env env_backend_${TIMESTAMP}.bak
    log_info "✓ Backend .env backed up"
fi

if [ -f "../../frontend/.env.local" ]; then
    cp ../../frontend/.env.local env_frontend_${TIMESTAMP}.bak
    log_info "✓ Frontend .env backed up"
fi

# 4. Create metadata file
log_info "Creating backup metadata..."

cat > backup_info.txt <<EOF
Backup Information
==================
Backup Name: ${BACKUP_NAME}
Timestamp: ${TIMESTAMP}
Date: $(date)
Hostname: $(hostname)
PostgreSQL: $([ -f "postgres_${TIMESTAMP}.sql.gz" ] && echo "✓" || echo "✗")
MinIO: $([ -f "minio_${TIMESTAMP}.tar.gz" ] && echo "✓" || echo "✗")
Env Files: $([ -f "env_backend_${TIMESTAMP}.bak" ] && echo "✓" || echo "✗")
EOF

log_info "✓ Metadata created"

# 5. Calculate backup size
BACKUP_SIZE=$(du -sh . | cut -f1)
log_info "Total backup size: ${BACKUP_SIZE}"

# 6. Clean old backups (retention policy)
log_info "Cleaning old backups (retention: ${RETENTION_DAYS} days)..."

# Contar ANTES de remover para o log ser correto
REMOVED_COUNT=$(find "${BACKUP_DIR}" -maxdepth 1 -name "backup_*" -type d -mtime +${RETENTION_DAYS} | wc -l)
find "${BACKUP_DIR}" -maxdepth 1 -name "backup_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true

if [ "$REMOVED_COUNT" -gt 0 ]; then
    log_info "✓ Removed ${REMOVED_COUNT} old backup(s)"
else
    log_info "No old backups to remove"
fi

# 7. List remaining backups
log_info "Available backups:"
ls -lh "${BACKUP_DIR}" | grep "backup_" || echo "  No backups found"

# Success
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Backup completed successfully!"
log_info "Location: ${BACKUP_DIR}/${BACKUP_NAME}"
log_info "Size: ${BACKUP_SIZE}"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit 0
