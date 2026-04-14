from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Role
from apps.accounts.permissions import DEFAULT_ROLES
from apps.core.models import Company


class Command(BaseCommand):
    help = "Cria ou atualiza os papéis (roles) padrão e suas permissões para todas as empresas"

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Iniciando atualização de papéis padrão..."))

        companies = Company.objects.all()

        if not companies.exists():
            self.stdout.write(self.style.WARNING("Nenhuma empresa encontrada. Rodando apenas para garantir estrutura."))

        total_updated = 0

        with transaction.atomic():
            pass  # Just opening a transaction block but doing nothing inside to clear previous errors if any? No.

        # We need to handle each company/role atomically if one fails to avoid breaking the whole loop
        for company in companies:
            self.stdout.write(f"Processando empresa: {company.name} ({company.domain})")

            for role_name, role_data in DEFAULT_ROLES.items():
                try:
                    with transaction.atomic():
                        # Use get_or_create to atomically handle existence check and creation
                        role, created = Role.all_objects.get_or_create(
                            company=company,
                            name=role_name,
                            defaults={
                                "description": role_data["description"],
                                "permissions": role_data["permissions"],
                                "is_system_role": True,
                            },
                        )

                        if not created:
                            # Update existing role permissions if it already existed
                            role.description = role_data["description"]
                            role.permissions = role_data["permissions"]
                            role.is_system_role = True
                            role.save()

                        status = "Criado" if created else "Atualizado"
                        self.stdout.write(f"  - Role {role_name}: {status}")
                        total_updated += 1
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f"  [!] Failed to process Role {role_name} for {company.name}: {e}")
                    )

        self.stdout.write(self.style.SUCCESS(f"Concluído! Total de papéis processados: {total_updated}"))
