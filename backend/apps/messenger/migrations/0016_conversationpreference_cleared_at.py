from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0015_conversationpreference_is_deleted"),
    ]

    operations = [
        migrations.AddField(
            model_name="conversationpreference",
            name="cleared_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
