import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0007_alter_dealactivity_activity_type"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CRMSavedView",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                (
                    "view_mode",
                    models.CharField(
                        choices=[("kanban", "Kanban"), ("list", "Tabela"), ("overview", "Visão Geral")],
                        default="kanban",
                        max_length=20,
                    ),
                ),
                ("filters", models.JSONField(blank=True, default=dict)),
                ("sorting", models.JSONField(blank=True, default=list)),
                ("column_visibility", models.JSONField(blank=True, default=dict)),
                ("is_default", models.BooleanField(default=False)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="core.company")),
                (
                    "owner",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="crm_saved_views", to=settings.AUTH_USER_MODEL),
                ),
                (
                    "pipeline",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="saved_views", to="crm.pipeline"),
                ),
            ],
            options={
                "verbose_name": "CRM Saved View",
                "verbose_name_plural": "CRM Saved Views",
                "ordering": ["-is_default", "name", "id"],
                "unique_together": {("company", "owner", "pipeline", "name")},
            },
        ),
        migrations.AddIndex(
            model_name="crmsavedview",
            index=models.Index(fields=["company", "owner", "pipeline"], name="crm_crmsave_company_6f80c5_idx"),
        ),
        migrations.AddIndex(
            model_name="crmsavedview",
            index=models.Index(fields=["company", "owner", "is_default"], name="crm_crmsave_company_1a23fd_idx"),
        ),
    ]
