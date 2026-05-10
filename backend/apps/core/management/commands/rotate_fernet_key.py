"""
Management command to rotate the Fernet encryption key.

Usage:
    # Generate a new key and re-encrypt all fields (interactive):
    python manage.py rotate_fernet_key

    # Non-interactive with an explicit new key:
    python manage.py rotate_fernet_key --new-key <base64-fernet-key>

    # Dry-run — show what would be re-encrypted without changing anything:
    python manage.py rotate_fernet_key --dry-run

Steps after running:
    1. Update FIELD_ENCRYPTION_KEY in your .env / secret manager to the NEW key printed at the end.
    2. Restart all backend processes (Django, Celery workers) so they use the new key.
    3. Discard the old key — it can no longer decrypt data.
"""

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Rotate the Fernet encryption key by re-encrypting all sensitive fields."

    def add_arguments(self, parser):
        parser.add_argument(
            "--new-key",
            type=str,
            default=None,
            help="New Fernet key (base64). Generated automatically if omitted.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be re-encrypted without making any changes.",
        )

    def handle(self, *args, **options):
        from cryptography.fernet import Fernet, InvalidToken
        from django.conf import settings

        from shared_kernel.encryption import generate_encryption_key

        old_key_str = getattr(settings, "FIELD_ENCRYPTION_KEY", None)
        if not old_key_str:
            raise CommandError(
                "FIELD_ENCRYPTION_KEY is not configured. "
                "Cannot rotate without knowing the current key."
            )

        old_cipher = Fernet(old_key_str.encode() if isinstance(old_key_str, str) else old_key_str)

        new_key_str = options["new_key"] or generate_encryption_key()
        new_cipher = Fernet(new_key_str.encode() if isinstance(new_key_str, str) else new_key_str)

        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be committed."))
        else:
            self.stdout.write(self.style.WARNING("Starting Fernet key rotation..."))

        total = 0
        errors = 0

        # ── TenantEmailConfig (smtp_password_encrypted) ──────────────────────
        total, errors = self._rotate_model(
            model_path="apps.core.models.TenantEmailConfig",
            field="smtp_password_encrypted",
            old_cipher=old_cipher,
            new_cipher=new_cipher,
            dry_run=dry_run,
            total=total,
            errors=errors,
        )

        # ── LDAPConfig (password_encrypted) — if it exists ───────────────────
        total, errors = self._rotate_model(
            model_path="apps.core.models.LDAPConfig",
            field="password_encrypted",
            old_cipher=old_cipher,
            new_cipher=new_cipher,
            dry_run=dry_run,
            total=total,
            errors=errors,
        )

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write("")
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"DRY RUN complete: {total} field(s) would be re-encrypted, {errors} error(s)."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Rotation complete: {total} field(s) re-encrypted, {errors} error(s)."))
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("ACTION REQUIRED: update your environment variable:"))
            self.stdout.write(f"  FIELD_ENCRYPTION_KEY={new_key_str}")
            self.stdout.write("")
            self.stdout.write("Then restart Django and Celery workers.")

    def _rotate_model(self, model_path, field, old_cipher, new_cipher, dry_run, total, errors):
        from cryptography.fernet import InvalidToken

        try:
            app_label, model_name = model_path.rsplit(".", 1)
            module = __import__(app_label, fromlist=[model_name])
            Model = getattr(module, model_name)
        except (ImportError, AttributeError):
            return total, errors

        qs = Model.objects.exclude(**{f"{field}__isnull": True}).exclude(**{f"{field}": b""})
        count = qs.count()

        if count == 0:
            self.stdout.write(f"  {model_path}.{field}: no records to rotate.")
            return total, errors

        self.stdout.write(f"  {model_path}.{field}: rotating {count} record(s)...")

        for obj in qs.iterator():
            raw = getattr(obj, field)
            if not raw:
                continue
            try:
                plaintext = old_cipher.decrypt(bytes(raw)).decode("utf-8")
                re_encrypted = new_cipher.encrypt(plaintext.encode("utf-8"))
                if not dry_run:
                    setattr(obj, field, re_encrypted)
                    obj.save(update_fields=[field])
                total += 1
            except InvalidToken:
                self.stderr.write(
                    self.style.ERROR(f"    [ERROR] {Model.__name__} id={obj.pk}: InvalidToken — already using new key or corrupted data.")
                )
                errors += 1
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"    [ERROR] {Model.__name__} id={obj.pk}: {exc}"))
                errors += 1

        return total, errors
