import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("atlas")

app.config_from_object("django.conf:settings", namespace="CELERY")

app.autodiscover_tasks()

# Global task time limits — prevents hung workers from blocking the queue indefinitely.
# Soft limit raises SoftTimeLimitExceeded so tasks can clean up; hard limit kills the worker.
app.conf.task_soft_time_limit = 240   # 4 min — raise SoftTimeLimitExceeded
app.conf.task_time_limit = 300        # 5 min — kill worker process
app.conf.task_acks_late = True        # Acknowledge only after task completes (safer on worker crash)
app.conf.worker_prefetch_multiplier = 1  # Prevent one worker from hoarding tasks

app.conf.task_routes = {
    # Heavy I/O — isolated so PDF generation doesn't starve email/notification tasks.
    "apps.reports.tasks.*": {"queue": "reports"},
    # Transactional — highest priority after default.
    "apps.accounts.tasks.*": {"queue": "emails"},
    "apps.notifications.tasks.*": {"queue": "notifications"},
}

app.conf.beat_schedule = {
    "capture-crm-metrics-daily": {
        "task": "apps.crm.tasks.capture_crm_metrics_snapshot",
        "schedule": crontab(hour=0, minute=0),
    },
}


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")
