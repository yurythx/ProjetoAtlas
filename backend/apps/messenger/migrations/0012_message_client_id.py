from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0011_rename_messenger_c_blocker_54c0fa_idx_messenger_c_blocker_13a1d2_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="client_id",
            field=models.UUIDField(blank=True, db_index=True, null=True),
        ),
    ]
