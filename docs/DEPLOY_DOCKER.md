# Deploy com Docker (Dev e Produção)

Este guia documenta o passo a passo para rodar o Atlas via Docker Compose em desenvolvimento e em produção (com Cloudflare Tunnel).

## Pré-requisitos

- Docker + Docker Compose v2
- Git
- Linux/macOS (recomendado para produção) ou Windows (funciona para deploy manual; o script `deploy.sh` é bash)

## Portas e Health Checks

- Backend (API): `http://localhost:8005`
  - Health: `GET /api/core/health/` (produção) e `GET /health/` (dev compose)
- Frontend (Next.js): `http://localhost:3005`
  - Health: `GET /api/health`

## Desenvolvimento (docker-compose.yml)

### 1) Preparar variáveis

- Backend: opcionalmente copie `backend/.env.docker` (o compose já tem defaults de dev)
- Frontend: já aponta para `http://localhost:8005` por padrão

Para um template geral, consulte `.env.example`.

### 2) Subir stack

```bash
docker compose up -d --build
```

Serviços:

- PostgreSQL (porta 5432)
- Redis (porta 6379)
- MinIO (porta 9000/9001)
- Backend (porta 8005)
- Celery worker/beat
- Frontend (porta 3005)

### 3) Rodar migrações e seed (recomendado)

```bash
docker compose exec backend python manage.py migrate --noinput
docker compose exec backend python manage.py seed_local
```

`seed_local` é idempotente e inclui: `seed_system + seed_pages + seed_cms + seed_crm`.

### 4) Logs e troubleshooting

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose ps
```

Se o MinIO subir sem bucket:

```bash
docker compose logs createbuckets
```

## Produção (docker-compose.prod.yml + Cloudflare Tunnel)

Este compose assume HTTPS e roteamento via Cloudflare Tunnel. Backend e frontend ficam bindados somente em loopback:

- backend: `127.0.0.1:8005`
- frontend: `127.0.0.1:3005`

### 1) Preparar `.env.prod`

Copie o template e preencha:

```bash
cp .env.prod.example .env.prod
```

Variáveis obrigatórias (resumo):

- `SECRET_KEY`
- `FIELD_ENCRYPTION_KEY`
- `ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`
- `REDIS_PASSWORD`, `REDIS_URL`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_STORAGE_BUCKET_NAME`, `AWS_S3_ENDPOINT_URL`
- `NEXT_PUBLIC_API_URL`, `FRONTEND_URL`
- `TUNNEL_TOKEN`

### 2) Subir os containers (modo manual)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 3) Migrações

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput
```

### 4) Bootstrap do sistema (primeira instalação)

Cria tenant padrão (`raiz`), roles base e usuário superadmin (`suporte` / `suporte123`) para acesso inicial.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py seed_system
```

Opcional (ambiente novo com dados de exemplo):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py seed_local
```

### 5) Coletar estáticos

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T backend python manage.py collectstatic --noinput
```

### 6) Verificação final

```bash
curl -f http://localhost:8005/api/core/health/
curl -f http://localhost:3005/api/health
```

### 7) Cloudflare Tunnel

O serviço `cloudflared` usa `TUNNEL_TOKEN`. Para detalhes de configuração do túnel e rotas, consulte:

- `ops/DEPLOY_CLOUDFLARE.md`

## Deploy automatizado (Linux/macOS)

O repositório inclui o script `scripts/deploy.sh`, que faz:

- validação do compose
- backup do banco quando disponível
- build/pull das imagens
- subida de DB/Redis
- migrações antes de subir a aplicação
- start de backend/frontend/celery/cloudflared
- health check e collectstatic

Uso:

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

Para usar imagens de um registry (pull):

```bash
./scripts/deploy.sh --pull
```

## Backup e Restore

Scripts:

- `scripts/backup.sh`
- `scripts/restore.sh`

O `deploy.sh` já tenta gerar um backup do Postgres quando o serviço `db` está no ar.

## Upgrade / Rollback

Upgrade padrão:

```bash
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend python manage.py migrate --noinput
```

Rollback (depende da sua estratégia: tag/commit anterior + backup do banco).

