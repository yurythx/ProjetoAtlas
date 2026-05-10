from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status


class HealthCheckTest(TestCase):
    def _get(self):
        return self.client.get(reverse("health_check"))

    def test_healthy_response_shape(self):
        """All services up → 200 with nested checks dict."""
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("checks", data)
        self.assertIn("version", data)
        self.assertIn("uptime_seconds", data)
        checks = data["checks"]
        for key in ("database", "redis", "minio", "celery"):
            self.assertIn(key, checks)

    def test_database_check_has_latency(self):
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        db = response.json()["checks"]["database"]
        self.assertEqual(db["status"], "ok")
        self.assertIsNotNone(db["latency_ms"])

    @patch("apps.core.health_view.connection")
    def test_database_down_returns_503(self, mock_conn):
        mock_conn.cursor.side_effect = Exception("DB down")
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        data = response.json()
        self.assertEqual(data["status"], "degraded")
        self.assertEqual(data["checks"]["database"]["status"], "error")

    @patch("apps.core.health_view.cache")
    def test_redis_down_returns_503(self, mock_cache):
        mock_cache.set.side_effect = Exception("Redis down")
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        data = response.json()
        self.assertEqual(data["status"], "degraded")
        self.assertEqual(data["checks"]["redis"]["status"], "error")

    @patch("apps.core.health_view._check_minio")
    def test_minio_down_does_not_kill_endpoint(self, mock_minio):
        """MinIO failure should degrade minio check but not affect 200 if DB+Redis are ok."""
        mock_minio.return_value = {"status": "error", "error": "bucket not found"}
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["checks"]["minio"]["status"], "error")

    @patch("apps.core.health_view._check_celery")
    def test_celery_warning_does_not_kill_endpoint(self, mock_celery):
        mock_celery.return_value = {"status": "warning", "queued_tasks": None}
        response = self._get()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["checks"]["celery"]["status"], "warning")
