from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0015_crmgroup_pipeline_visibility_groups"),
        ("accounts", "0017_user_crm_groups"),
    ]

    operations = [
        migrations.AddField(
            model_name="invitation",
            name="crm_groups",
            field=models.ManyToManyField(blank=True, related_name="invitations", to="crm.crmgroup"),
        ),
    ]

