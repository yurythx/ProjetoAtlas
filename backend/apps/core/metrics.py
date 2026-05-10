"""
Custom Prometheus metrics for Atlas.

Registered on import via prometheus_client's default registry.
Scraped at /metrics alongside django-prometheus built-ins.
"""
import logging

from prometheus_client import Gauge
from prometheus_client.registry import REGISTRY

logger = logging.getLogger(__name__)

# ── Celery queue depth ────────────────────────────────────────────────────────
# Updated by CeleryQueueCollector on each /metrics scrape so the value is
# always fresh without a separate polling process.

_celery_queue_length = Gauge(
    "atlas_celery_queue_length",
    "Number of pending tasks in each Celery queue (sampled at scrape time)",
    ["queue"],
)

_CELERY_QUEUES = ["celery", "default", "emails", "notifications"]


class _CeleryQueueCollector:
    """Custom collector that refreshes queue gauges on every Prometheus scrape."""

    def collect(self):
        try:
            from django_redis import get_redis_connection

            conn = get_redis_connection("default")
            for queue in _CELERY_QUEUES:
                depth = int(conn.llen(queue))
                _celery_queue_length.labels(queue=queue).set(depth)
        except Exception as exc:
            logger.warning("Could not collect Celery queue metrics: %s", exc)
        # Return empty — we update the Gauge above; the registry will expose it.
        return []


_collector = _CeleryQueueCollector()
REGISTRY.register(_collector)
