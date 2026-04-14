from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0017_conversationpreference_user_is_deleted_index"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationpreference",
            name="is_archived",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="conversationpreference",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
