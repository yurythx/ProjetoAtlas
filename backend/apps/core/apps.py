from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"

    def ready(self):
        import apps.core.signals  # noqa
        import apps.core.metrics  # noqa: registers Celery queue Prometheus collector
