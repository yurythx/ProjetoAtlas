import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0014_company_soft_delete"),
        ("crm", "0014_inboundevent_replayed_from"),
    ]

    operations = [
        migrations.CreateModel(
            name="CRMGroup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("slug", models.SlugField(max_length=140)),
                ("company", models.ForeignKey(db_index=True, on_delete=django.db.models.deletion.CASCADE, to="core.company")),
            ],
            options={
                "verbose_name": "CRM Group",
                "verbose_name_plural": "CRM Groups",
                "unique_together": {("company", "slug"), ("company", "name")},
            },
        ),
        migrations.AddField(
            model_name="pipeline",
            name="visibility",
            field=models.CharField(choices=[("company", "Empresa"), ("group", "Grupo")], default="company", max_length=20),
        ),
        migrations.AddField(
            model_name="pipeline",
            name="groups",
            field=models.ManyToManyField(blank=True, related_name="pipelines", to="crm.crmgroup"),
        ),
    ]
