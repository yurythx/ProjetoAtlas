from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0016_conversationpreference_cleared_at"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="conversationpreference",
            index=models.Index(fields=["user", "is_deleted"], name="messenger_c_user_id_d4ed4f_idx"),
        ),
    ]
