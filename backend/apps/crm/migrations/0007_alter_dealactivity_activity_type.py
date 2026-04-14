from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0006_column_semantics"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dealactivity",
            name="activity_type",
            field=models.CharField(
                choices=[
                    ("column_change", "Mudança de Coluna"),
                    ("stage_change", "Mudança de Coluna (Legado)"),
                    ("note", "Nota Manual"),
                    ("automation", "Automação"),
                    ("creation", "Criação"),
                ],
                max_length=50,
            ),
        ),
    ]
