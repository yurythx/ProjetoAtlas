from django.apps import AppConfig


class CrmConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.crm"

    def ready(self):
        from django.db.models.signals import post_delete, post_save

        from . import signals

        Pipeline = self.get_model("Pipeline")
        Stage = self.get_model("Stage")
        Deal = self.get_model("Deal")

        post_save.connect(signals.create_default_stages, sender=Pipeline)
        post_save.connect(signals.ensure_column_for_stage, sender=Stage)
        post_save.connect(signals.sync_deal_with_calendar, sender=Deal)
        post_save.connect(signals.trigger_xla_survey, sender=Deal)
        post_delete.connect(signals.delete_calendar_event, sender=Deal)
