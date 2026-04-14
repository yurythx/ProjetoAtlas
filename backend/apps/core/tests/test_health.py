from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status


class HealthCheckTest(TestCase):
    @patch("apps.core.health.get_redis_connection")
    def test_health_check_ok(self, mock_get_redis):
        """Should return 200 OK and status 'ok' when everything is fine"""
        # Mock successful redis ping
        mock_conn = mock_get_redis.return_value
        mock_conn.ping.return_value = True

        response = self.client.get(reverse("health_check"))
        if response.status_code != 200:
            print(f"Health Check Fail: {response.json()}")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["database"], "ok")
        self.assertEqual(data["redis"], "ok")

    @patch("apps.core.health.connection.cursor")
    def test_database_down(self, mock_cursor):
        """Should return 503 if database fails"""
        # Mocking context manager enter to raise exception
        mock_cursor.side_effect = Exception("DB Connection Error")

        response = self.client.get(reverse("health_check"))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json()["status"], "error")
        self.assertNotEqual(response.json()["database"], "ok")

    @patch("apps.core.health.get_redis_connection")
    def test_redis_down(self, mock_get_redis):
        """Should return 503 if redis fails"""
        # Mock redis connection ping to raise exception
        mock_conn = mock_get_redis.return_value
        mock_conn.ping.side_effect = Exception("Redis Connection Error")

        response = self.client.get(reverse("health_check"))
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.json()["status"], "error")
        self.assertNotEqual(response.json()["redis"], "ok")
