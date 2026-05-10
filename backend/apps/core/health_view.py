import logging
import time

import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

logger = logging.getLogger(__name__)

# Captured once at import time so uptime_seconds is meaningful across requests.
_BOOT_TIME = time.time()


def _check_db() -> dict:
    start = time.time()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return {"status": "ok", "latency_ms": round((time.time() - start) * 1000, 2)}
    except Exception as exc:
        logger.error("Health DB error: %s", exc)
        return {"status": "error", "latency_ms": None}


def _check_redis() -> dict:
    start = time.time()
    try:
        cache.set("_hc_ping", "1", timeout=5)
        assert cache.get("_hc_ping") == "1"
        return {"status": "ok", "latency_ms": round((time.time() - start) * 1000, 2)}
    except Exception as exc:
        logger.error("Health Redis error: %s", exc)
        return {"status": "error", "latency_ms": None}


def _check_minio() -> dict:
    if not getattr(settings, "USE_S3", False):
        return {"status": "ok", "note": "S3 disabled"}
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=getattr(settings, "AWS_S3_REGION_NAME", "us-east-1"),
        )
        s3.head_bucket(Bucket=settings.AWS_STORAGE_BUCKET_NAME)
        return {"status": "ok", "bucket": settings.AWS_STORAGE_BUCKET_NAME}
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "unknown")
        logger.error("Health MinIO error: %s", code)
        return {"status": "error", "error": code}
    except Exception as exc:
        logger.error("Health MinIO error: %s", exc)
        return {"status": "error"}


def _check_celery() -> dict:
    """
    Probe Celery by counting pending tasks in the default queue via Redis.
    Avoids inspect.active() which opens an AMQP connection and can block for seconds.
    """
    try:
        from django_redis import get_redis_connection

        redis_conn = get_redis_connection("default")
        queued = int(redis_conn.llen("celery"))
        return {"status": "ok", "queued_tasks": queued}
    except Exception as exc:
        logger.warning("Health Celery check failed: %s", exc)
        return {"status": "warning", "queued_tasks": None}


@extend_schema(
    responses={
        200: {
            "type": "object",
            "properties": {
                "status": {"type": "string", "example": "healthy"},
                "checks": {
                    "type": "object",
                    "properties": {
                        "database": {"type": "object"},
                        "redis": {"type": "object"},
                        "minio": {"type": "object"},
                        "celery": {"type": "object"},
                    },
                },
                "version": {"type": "string", "example": "1.0.0"},
                "uptime_seconds": {"type": "number", "example": 3600},
            },
        }
    }
)
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@throttle_classes([])
def health_check(request):
    db = _check_db()
    redis = _check_redis()
    minio = _check_minio()
    celery = _check_celery()

    # Only DB and Redis are hard requirements; MinIO/Celery degrade gracefully.
    critical_ok = db["status"] == "ok" and redis["status"] == "ok"

    return Response(
        {
            "status": "healthy" if critical_ok else "degraded",
            "checks": {
                "database": db,
                "redis": redis,
                "minio": minio,
                "celery": celery,
            },
            "version": settings.SPECTACULAR_SETTINGS.get("VERSION", "unknown"),
            "uptime_seconds": round(time.time() - _BOOT_TIME),
        },
        status=status.HTTP_200_OK if critical_ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
