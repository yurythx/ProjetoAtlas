import time

import boto3
from botocore.exceptions import ClientError
from celery import current_app
from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django_redis import get_redis_connection


def health_check(request):
    """
    Comprehensive health check for all critical services.
    Returns 200 if all services are healthy, 503 if any fails.
    """
    start_time = time.time()

    health = {"status": "ok", "timestamp": time.time()}

    all_healthy = True

    db_status = check_database()
    health["database"] = "ok" if db_status["status"] == "healthy" else "error"
    if health["database"] != "ok":
        all_healthy = False

    redis_status = check_redis()
    if redis_status["status"] == "healthy":
        health["redis"] = "ok"
    else:
        health["redis"] = "warning" if settings.DEBUG else "error"
        if not settings.DEBUG:
            all_healthy = False

    if getattr(settings, "USE_S3", False):
        minio_status = check_minio()
        health["minio"] = "ok" if minio_status["status"] == "healthy" else "error"
        if minio_status["status"] != "healthy":
            all_healthy = False

    celery_status = check_celery()
    health["celery"] = "ok" if celery_status["status"] == "healthy" else "warning"

    if not all_healthy:
        health["status"] = "error"

    health["response_time_ms"] = round((time.time() - start_time) * 1000, 2)

    status_code = 200 if health["status"] == "ok" else 503

    return JsonResponse(health, status=status_code)


def check_database():
    """Check PostgreSQL connection and responsiveness"""
    try:
        start = time.time()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

        response_time = round((time.time() - start) * 1000, 2)

        return {
            "status": "healthy",
            "response_time_ms": response_time,
            "type": connection.settings_dict.get("ENGINE", "unknown"),
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e), "type": "database"}


def check_redis():
    try:
        conn = get_redis_connection("default")
        conn.ping()
        return {"status": "healthy"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


def check_minio():
    """Check MinIO/S3 connection and bucket access"""
    try:
        start = time.time()

        # Create S3 client
        s3_client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION_NAME,
        )

        # Check if bucket exists
        bucket_name = settings.AWS_STORAGE_BUCKET_NAME
        s3_client.head_bucket(Bucket=bucket_name)

        response_time = round((time.time() - start) * 1000, 2)

        return {
            "status": "healthy",
            "response_time_ms": response_time,
            "bucket": bucket_name,
            "endpoint": settings.AWS_S3_ENDPOINT_URL,
        }
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        return {"status": "unhealthy", "error": f"MinIO Error: {error_code}", "type": "minio"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e), "type": "minio"}


def check_celery():
    """Check Celery worker status"""
    try:
        # Get active workers
        inspect = current_app.control.inspect()
        active_workers = inspect.active()

        if active_workers:
            worker_count = len(active_workers)
            return {"status": "healthy", "workers": worker_count, "worker_names": list(active_workers.keys())}
        else:
            return {"status": "warning", "message": "No active Celery workers found", "workers": 0}
    except Exception as e:
        return {"status": "warning", "error": str(e), "message": "Celery check failed (non-critical)"}
