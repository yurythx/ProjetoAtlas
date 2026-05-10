import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_auditlog_updated_at"),
        ("crm", "0029_metricsnapshot"),
    ]

    operations = [
        migrations.CreateModel(
            name="AutomationRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_deleted", models.BooleanField(db_index=True, default=False)),
                ("name", models.CharField(max_length=200)),
                ("is_active", models.BooleanField(default=True)),
                ("trigger", models.CharField(
                    choices=[
                        ("deal_created", "Card criado"),
                        ("deal_moved", "Card movido de coluna"),
                        ("sla_breached", "SLA violado"),
                        ("deal_closed", "Card fechado"),
                    ],
                    max_length=50,
                )),
                ("conditions", models.JSONField(blank=True, default=dict)),
                ("action", models.CharField(
                    choices=[
                        ("notify_assignee", "Notificar responsável"),
                        ("send_webhook", "Enviar webhook"),
                        ("assign_user", "Atribuir usuário"),
                        ("create_notification", "Criar notificação para usuário específico"),
                    ],
                    max_length=50,
                )),
                ("action_config", models.JSONField(blank=True, default=dict)),
                ("execution_count", models.PositiveIntegerField(default=0)),
                ("last_triggered_at", models.DateTimeField(blank=True, null=True)),
                ("company", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="crm_automationrule_set",
                    to="core.company",
                )),
                ("pipeline", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="automation_rules",
                    to="crm.pipeline",
                )),
            ],
            options={"verbose_name": "Automation Rule", "verbose_name_plural": "Automation Rules", "ordering": ["pipeline", "name"]},
        ),
    ]
