from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0015_crmgroup_pipeline_visibility_groups"),
        ("accounts", "0016_usernotificationpreference_article_pending"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="crm_groups",
            field=models.ManyToManyField(blank=True, related_name="users", to="crm.crmgroup"),
        ),
    ]

