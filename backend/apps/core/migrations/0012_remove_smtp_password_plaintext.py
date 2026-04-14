# Migration to remove the deprecated smtp_password plaintext field.
# All passwords must now be stored encrypted via smtp_password_encrypted.
#
# DATA SAFETY: If you have existing records using smtp_password (plaintext),
# run this management command BEFORE applying this migration:
#   python manage.py migrate_smtp_passwords
# This will encrypt any remaining plaintext passwords into smtp_password_encrypted.

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0011_add_ldap_config"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="tenantemailconfig",
            name="smtp_password",
        ),
    ]
