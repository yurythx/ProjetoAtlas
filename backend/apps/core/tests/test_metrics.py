"""
Tests for the custom Prometheus metrics collector (apps/core/metrics.py).

The collector reads Celery queue depths from Redis on each scrape.
We verify it:
- sets the correct gauge values per queue
- silently ignores Redis errors (no exception propagates)
- collects across all expected queues
"""

from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.django_db
class TestCeleryQueueCollector:
    def _get_collector(self):
        from apps.core import metrics as m
        return m._collector

    def _get_gauge(self, queue: str) -> float:
        from apps.core import metrics as m
        return m._celery_queue_length.labels(queue=queue)._value.get()

    def test_collect_updates_gauges_for_all_queues(self):
        from apps.core import metrics as m

        fake_depths = {"celery": 5, "default": 0, "emails": 3, "notifications": 12}

        def fake_llen(queue_name):
            return fake_depths.get(queue_name, 0)

        mock_conn = MagicMock()
        mock_conn.llen.side_effect = fake_llen

        with patch("apps.core.metrics.get_redis_connection", return_value=mock_conn):
            list(m._collector.collect())  # consume the generator

        for queue, expected in fake_depths.items():
            assert self._get_gauge(queue) == float(expected), (
                f"Queue '{queue}': expected {expected}, got {self._get_gauge(queue)}"
            )

    def test_collect_returns_empty_iterable(self):
        from apps.core import metrics as m

        mock_conn = MagicMock()
        mock_conn.llen.return_value = 0

        with patch("apps.core.metrics.get_redis_connection", return_value=mock_conn):
            result = list(m._collector.collect())

        assert result == [], "Collector must return [] — gauges are updated in-place, not yielded"

    def test_collect_silences_redis_errors(self):
        from apps.core import metrics as m

        with patch("apps.core.metrics.get_redis_connection", side_effect=Exception("Redis down")):
            # Must NOT raise
            try:
                list(m._collector.collect())
            except Exception as exc:
                pytest.fail(f"collect() raised an exception when Redis was down: {exc}")

    def test_collect_calls_llen_for_each_queue(self):
        from apps.core import metrics as m

        mock_conn = MagicMock()
        mock_conn.llen.return_value = 0

        with patch("apps.core.metrics.get_redis_connection", return_value=mock_conn):
            list(m._collector.collect())

        queued_names = {call.args[0] for call in mock_conn.llen.call_args_list}
        assert queued_names == set(m._CELERY_QUEUES), (
            f"Expected llen calls for {m._CELERY_QUEUES}, got {queued_names}"
        )
