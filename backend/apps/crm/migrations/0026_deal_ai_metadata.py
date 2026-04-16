from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('crm', '0025_column_created_at_column_updated_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='deal',
            name='ai_metadata',
            field=models.JSONField(blank=True, default=dict, help_text='AI Insights, Risk Analysis, and Actionable Intelligence'),
        ),
    ]
