from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0008_crmsavedview"),
    ]

    operations = [
        migrations.AddField(
            model_name="column",
            name="allowed_source_columns",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="column",
            name="wip_limit",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
