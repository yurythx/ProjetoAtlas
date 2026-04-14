from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0018_conversationpreference_is_archived"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="conversationpreference",
            index=models.Index(fields=["user", "is_archived"], name="messenger_c_user_id_4bd6fb_idx"),
        ),
    ]
