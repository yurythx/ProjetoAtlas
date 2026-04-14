from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.core.models import Company

User = get_user_model()


class Command(BaseCommand):
    help = "Creates a support superuser"

    def handle(self, *args, **options):
        # Ensure a default company exists for the superuser (since TenantModel might require it)
        # Usually superusers might be linked to the "HQ" company
        company, _ = Company.objects.get_or_create(
            slug="blackbone", defaults={"name": "BlackBone HQ", "domain": "blackbone.com"}
        )

        if not User.objects.filter(username="suporte").exists():
            User.objects.create_superuser(
                username="suporte", email="suporte@blackbone.com", password="suporte123", company=company
            )
            self.stdout.write(self.style.SUCCESS('Superuser "suporte" created successfully'))
        else:
            self.stdout.write(self.style.WARNING('Superuser "suporte" already exists'))
