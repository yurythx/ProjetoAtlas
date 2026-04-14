from django.apps import AppConfig


class ModuleManagerConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.module_manager"

    def ready(self):
        pass
