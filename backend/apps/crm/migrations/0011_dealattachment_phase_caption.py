from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0010_dealattachment"),
    ]

    operations = [
        migrations.AddField(
            model_name="dealattachment",
            name="caption",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="dealattachment",
            name="phase",
            field=models.CharField(
                choices=[("before", "Antes"), ("during", "Durante"), ("after", "Depois")],
                default="during",
                max_length=20,
            ),
        ),
    ]

