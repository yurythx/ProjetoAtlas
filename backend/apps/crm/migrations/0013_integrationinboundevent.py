import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0012_deal_messenger_conversation"),
    ]

    operations = [
        migrations.CreateModel(
            name="IntegrationInboundEvent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="crm_integrationinboundevent_company", to="core.company")),
                ("source", models.CharField(max_length=50)),
                ("event_type", models.CharField(default="ticket.upsert", max_length=80)),
                ("external_id", models.CharField(max_length=255)),
                ("request_payload", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(choices=[("received", "Recebido"), ("processed", "Processado"), ("failed", "Falhou")], default="received", max_length=20)),
                ("response_status_code", models.IntegerField(blank=True, null=True)),
                ("error", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("processed_deal", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="integration_events", to="crm.deal")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="integrationinboundevent",
            index=models.Index(fields=["company", "source", "created_at"], name="crm_integra_company_9f79a0_idx"),
        ),
        migrations.AddIndex(
            model_name="integrationinboundevent",
            index=models.Index(fields=["company", "source", "external_id"], name="crm_integra_company_164314_idx"),
        ),
        migrations.AddIndex(
            model_name="integrationinboundevent",
            index=models.Index(fields=["company", "status", "created_at"], name="crm_integra_company_8c0cff_idx"),
        ),
    ]

