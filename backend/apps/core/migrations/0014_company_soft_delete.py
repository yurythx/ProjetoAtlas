# Generated migration for A4: soft-delete support on Company model.
# Adds is_active (BooleanField, default=True) and deactivated_at (DateTimeField, nullable).
# Uses SAFE defaults so existing companies remain active after migration.

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_alter_tenantbranding_icon_alter_tenantbranding_logo"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="is_active",
            field=models.BooleanField(
                default=True,
                db_index=True,
                help_text="Inactive companies are hidden from the API but data is preserved.",
            ),
        ),
        migrations.AddField(
            model_name="company",
            name="deactivated_at",
            field=models.DateTimeField(
                null=True,
                blank=True,
                help_text="Set automatically when is_active is flipped to False.",
            ),
        ),
    ]
