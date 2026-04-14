#!/bin/sh

# Verify if postgres is ready
if [ "$DATABASE_URL" ]; then
    echo "Waiting for postgres..."
    # The host 'db' is the name of the postgres service in docker-compose
    while ! nc -z db 5432; do
      sleep 1
    done
    echo "PostgreSQL started"
fi

# Migrations and collectstatic removed from entrypoint to avoid 
# concurrent execution across multiple services (backend, celery, beat)
# and to allow the healthcheck to pass quickly. 
# They are now handled exclusively by the deploy.sh script.

# Exec the container's main process
exec "$@"
