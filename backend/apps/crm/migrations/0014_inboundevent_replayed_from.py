import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0013_integrationinboundevent"),
    ]

    operations = [
        migrations.AddField(
            model_name="integrationinboundevent",
            name="replayed_from",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="replays", to="crm.integrationinboundevent"),
        ),
    ]

