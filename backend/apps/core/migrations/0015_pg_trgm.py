from django.db import migrations
from django.contrib.postgres.operations import TrigramExtension

class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_company_soft_delete"),
    ]

    operations = [
        TrigramExtension(),
    ]
