from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0015_usernotificationpreference_granular"),
    ]

    operations = [
        migrations.AddField(
            model_name="usernotificationpreference",
            name="notify_moderation_article_pending",
            field=models.BooleanField(default=True, help_text="Receber notificações quando houver artigos pendentes"),
        ),
    ]
