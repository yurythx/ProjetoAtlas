from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("messenger", "0001_initial"),
        ("crm", "0011_dealattachment_phase_caption"),
    ]

    operations = [
        migrations.AddField(
            model_name="deal",
            name="messenger_conversation",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="crm_deals",
                to="messenger.conversation",
            ),
        ),
    ]

