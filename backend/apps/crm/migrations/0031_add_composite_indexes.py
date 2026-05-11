from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0030_automationrule"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="deal",
            index=models.Index(
                fields=["company", "is_deleted"],
                name="crm_deal_company_deleted_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="deal",
            index=models.Index(
                fields=["company", "is_deleted", "column"],
                name="crm_deal_company_deleted_col_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="deal",
            index=models.Index(
                fields=["company", "owner"],
                name="crm_deal_company_owner_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="deal",
            index=models.Index(
                fields=["company", "sla_resolution_deadline"],
                name="crm_deal_sla_deadline_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="dealactivity",
            index=models.Index(
                fields=["deal", "created_at"],
                name="crm_dealactivity_deal_created_idx",
            ),
        ),
    ]
