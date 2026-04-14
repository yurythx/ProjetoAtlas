#!/bin/bash

# Restore Script for Atlas SaaS
# Restores PostgreSQL database and MinIO storage from backup
# Usage: ./restore.sh <backup_name>

set -euo pipefail  # Exit on error, unset vars, pipe failures

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

# Check arguments
if [ -z "$1" ]; then
    log_error "Usage: $0 <backup_name>"
    log_info "Available backups:"
    BACKUP_DIR="${BACKUP_DIR:-/backups}"
    ls -1 "$BACKUP_DIR" | grep "backup_" || echo "  No backups found"
    exit 1
fi

BACKUP_NAME="$1"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_DIR_FULL="${BACKUP_DIR}/${BACKUP_NAME}"

# Detect env file
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

# Detect compose command
if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
else
    log_error "Neither 'docker compose' nor 'docker-compose' found!"
    exit 1
fi

# Check if backup exists
if [ ! -d "$BACKUP_DIR_FULL" ]; then
    log_error "Backup not found: ${BACKUP_DIR_FULL}"
    log_info "Available backups:"
    ls -1 "${BACKUP_DIR}" | grep "backup_" || echo "  No backups found"
    exit 1
fi

log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_warning "WARNING: This will OVERWRITE current data!"
log_warning "Backup to restore: ${BACKUP_NAME}"
log_warning "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Are you sure? (yes/no): " confirmation

if [ "$confirmation" != "yes" ]; then
    log_info "Restore cancelled."
    exit 0
fi

cd "$BACKUP_DIR_FULL"

# Show backup info
if [ -f "backup_info.txt" ]; then
    log_info "Backup information:"
    cat backup_info.txt
    echo ""
fi

# 1. Restore PostgreSQL
log_info "Restoring PostgreSQL database..."

POSTGRES_BACKUP=$(ls postgres_*.sql.gz 2>/dev/null | head -n 1)

if [ -z "$POSTGRES_BACKUP" ]; then
    log_error "PostgreSQL backup file not found!"
    exit 1
fi

log_info "Found backup: ${POSTGRES_BACKUP}"

if command -v docker &> /dev/null; then
    if [ -n "${COMPOSE_CMD}" ]; then
        gunzip -c "$POSTGRES_BACKUP" | $COMPOSE_CMD exec -T db psql -U "$DB_USER" -d "$DB_NAME"
    else
        CONTAINER_ID=$(docker ps --filter "name=atlas_db" --format "{{.ID}}" | head -n 1)
        if [ -z "$CONTAINER_ID" ]; then
            log_error "PostgreSQL container not found!"
            exit 1
        fi
        gunzip -c "$POSTGRES_BACKUP" | docker exec -i $CONTAINER_ID psql -U "$DB_USER" -d "$DB_NAME"
    fi

    if [ $? -eq 0 ]; then
        log_info "✓ PostgreSQL restore completed"
    else
        log_error "✗ PostgreSQL restore failed!"
        exit 1
    fi
else
    log_error "Docker not found! Cannot restore database."
    exit 1
fi

# 2. Restore MinIO/S3 Storage
log_info "Restoring MinIO storage..."

MINIO_BACKUP=$(ls minio_*.tar.gz 2>/dev/null | head -n 1)

if [ -z "$MINIO_BACKUP" ]; then
    log_warning "MinIO backup file not found. Skipping MinIO restore."
else
    log_info "Found backup: ${MINIO_BACKUP}"
    
    if command -v mc &> /dev/null; then
        # Extract backup
        tar -xzf "$MINIO_BACKUP"
        
        # Configure mc alias
        mc alias set atlas-minio http://localhost:9000 "$MINIO_USER" "$MINIO_PASS" 2>/dev/null || true
        
        # Mirror backup to bucket
        mc mirror --overwrite minio_backup atlas-minio/${BUCKET_NAME}
        
        # Clean up
        rm -rf minio_backup
        
        log_info "✓ MinIO restore completed"
    else
        log_warning "MinIO client (mc) not installed. Skipping MinIO restore."
    fi
fi

# 3. Restore .env files (optional)
log_info "Checking for environment files..."

ENV_BACKEND=$(ls env_backend_*.bak 2>/dev/null | head -n 1)
ENV_FRONTEND=$(ls env_frontend_*.bak 2>/dev/null | head -n 1)

if [ -n "$ENV_BACKEND" ] || [ -n "$ENV_FRONTEND" ]; then
    log_warning "Environment file backups found. Restore them?"
    log_warning "This will overwrite your current .env files!"
    read -p "Restore .env files? (yes/no): " env_confirmation
    
    if [ "$env_confirmation" = "yes" ]; then
        if [ -n "$ENV_BACKEND" ]; then
            cp "$ENV_BACKEND" ../../backend/.env
            log_info "✓ Backend .env restored"
        fi
        
        if [ -n "$ENV_FRONTEND" ]; then
            cp "$ENV_FRONTEND" ../../frontend/.env.local
            log_info "✓ Frontend .env restored"
        fi
    else
        log_info "Skipped .env restore"
    fi
fi

# 4. Restart services (optional)
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_info "Restore completed successfully!"
log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log_warning "Reminder: You may need to restart services:"
log_info "  $COMPOSE_CMD restart"
log_info ""
log_warning "Verify data integrity before proceeding!"

exit 0
