from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0006_transaction_is_recurring_transaction_recurrence_rule"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="transaction",
            index=models.Index(fields=["company", "due_date"], name="finance_txn_company_due_date_idx"),
        ),
        migrations.AddIndex(
            model_name="transaction",
            index=models.Index(fields=["company", "due_date", "status"], name="finance_txn_company_due_status_idx"),
        ),
    ]
