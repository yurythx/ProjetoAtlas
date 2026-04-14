from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Popula o banco local (idempotente): seed_system + seed_pages + seed_cms + seed_crm."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Seeding local database..."))
        call_command("seed_system")
        call_command("seed_pages")
        call_command("seed_cms")
        call_command("seed_crm")
        self.stdout.write(self.style.SUCCESS("Local seeding concluído."))

