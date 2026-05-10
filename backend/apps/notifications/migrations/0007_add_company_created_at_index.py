from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0006_notification_icon_notification_module_and_more"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(
                fields=["company", "created_at"],
                name="notif_company_created_at_idx",
            ),
        ),
    ]
