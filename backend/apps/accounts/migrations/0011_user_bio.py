from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0010_alter_user_avatar"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="bio",
            field=models.TextField(
                blank=True, default="", help_text="Bio curta do usuário (exibida no perfil e em conteúdos)"
            ),
        ),
    ]
