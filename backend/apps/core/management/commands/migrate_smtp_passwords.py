"""
Management command to migrate existing SMTP passwords to encrypted format.

Usage:
    python manage.py migrate_smtp_passwords
"""

from django.core.management.base import BaseCommand

from apps.core.models import TenantEmailConfig


class Command(BaseCommand):
    help = "Migrate existing SMTP passwords from plaintext to encrypted format"

    def handle(self, *args, **options):
        # Find all configs with SMTP enabled
        configs = TenantEmailConfig.objects.filter(use_custom_smtp=True)

        migrated_count = 0
        skip_count = 0

        self.stdout.write(self.style.WARNING(f"Found {configs.count()} SMTP configurations"))

        for config in configs:
            # Check if password needs migration
            if config.smtp_password and not config.smtp_password_encrypted:
                self.stdout.write(self.style.WARNING(f"Migrating password for: {config.company.name}"))

                # Encrypt and save
                config.set_smtp_password(config.smtp_password)
                config.save()

                migrated_count += 1
                self.stdout.write(self.style.SUCCESS("  ✓ Migrated successfully"))
            elif config.smtp_password_encrypted:
                skip_count += 1
                self.stdout.write(self.style.SUCCESS(f"Skipping {config.company.name}: already encrypted"))
            else:
                skip_count += 1
                self.stdout.write(self.style.WARNING(f"Skipping {config.company.name}: no password set"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 50))
        self.stdout.write(self.style.SUCCESS("Migration complete!"))
        self.stdout.write(self.style.SUCCESS(f"  Migrated: {migrated_count}"))
        self.stdout.write(self.style.SUCCESS(f"  Skipped: {skip_count}"))
        self.stdout.write(self.style.SUCCESS("=" * 50))
