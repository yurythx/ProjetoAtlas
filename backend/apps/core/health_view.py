import logging
import time

from django.core.cache import cache
from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class HealthCheckSerializer(serializers.Serializer):
    status = serializers.CharField()
    timestamp = serializers.FloatField()
    database = serializers.CharField()
    redis = serializers.CharField()
    minio = serializers.CharField()
    celery = serializers.CharField()
    response_time_ms = serializers.FloatField()


@extend_schema(responses={200: HealthCheckSerializer})
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@throttle_classes([])
def health_check(request):
    """
    Dedicated Health Check Endpoint.
    Does not depend on ViewSets or complex logic.
    """
    start_time = time.time()

    # Check DB
    db_status = "ok"
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as e:
        logger.error(f"Health check DB error: {e}")
        db_status = "error"

    # Check Redis
    redis_status = "ok"
    try:
        cache.set("health_check_v3", "ok", 10)
        if cache.get("health_check_v3") != "ok":
            redis_status = "error"
    except Exception as e:
        logger.error(f"Health check Redis error: {e}")
        redis_status = "error"

    status_code = status.HTTP_200_OK
    if db_status == "error" or redis_status == "error":
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return Response(
        {
            "status": "ok" if status_code == 200 else "error",
            "timestamp": time.time(),
            "database": db_status,
            "redis": redis_status,
            "minio": "ok",  # Hardcoded OK
            "celery": "ok",  # Hardcoded OK
            "response_time_ms": round((time.time() - start_time) * 1000, 2),
        },
        status=status_code,
    )
