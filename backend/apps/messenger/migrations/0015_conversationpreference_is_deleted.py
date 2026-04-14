from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0014_messagedelivery"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationpreference",
            name="is_deleted",
            field=models.BooleanField(db_index=True, default=False),
        ),
        migrations.AddField(
            model_name="conversationpreference",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
