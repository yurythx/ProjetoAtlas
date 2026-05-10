from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0016_auditlog_updated_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="language_code",
            field=models.CharField(
                choices=[("pt-br", "Português (Brasil)"), ("en-us", "English (US)")],
                default="pt-br",
                help_text="Default language for this tenant's users.",
                max_length=10,
            ),
        ),
    ]
