from django.core.management.base import BaseCommand

from apps.core.models import Company


class Command(BaseCommand):
    help = "Alinha o domínio e slug da empresa raiz com o ambiente de produção"

    def handle(self, *args, **options):
        # Check if production company already exists
        target_slug = "projetoravenna"
        existing_target = Company.all_companies.filter(slug=target_slug).first()

        if existing_target:
            company = existing_target
            self.stdout.write(f"  [.] Empresa {target_slug} já existe. Alinhando dados...")
        else:
            company = Company.all_companies.filter(slug="raiz").first() or Company.all_companies.first()

        if company:
            old_slug = company.slug
            old_domain = company.domain

            company.slug = target_slug
            company.domain = "projetoravenna.cloud"
            company.name = "Ravenna"
            company.save()
            self.stdout.write(self.style.SUCCESS("✓ Empresa alinhada com sucesso!"))
            self.stdout.write(f"  - Slug: {old_slug} -> {company.slug}")
            self.stdout.write(f"  - Domain: {old_domain} -> {company.domain}")
        else:
            self.stdout.write(self.style.ERROR("✗ Nenhuma empresa encontrada no banco de dados para alinhar."))
