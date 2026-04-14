from django.core.management.base import BaseCommand
from django.utils.text import slugify

from apps.core.models import Company
from apps.pages.models import Page
from shared_kernel.tenant_context import set_current_company

DEFAULT_PAGES = [
    {
        "title": "Sobre Nós",
        "slug": "sobre",
        "content": "<h1>Sobre Nós</h1><p>Informações sobre a empresa.</p>",
        "meta_title": "Sobre Nós",
        "meta_description": "Informações institucionais da empresa.",
    },
    {
        "title": "Contato",
        "slug": "contato",
        "content": "<h1>Contato</h1><p>Fale conosco pelos canais oficiais.</p>",
        "meta_title": "Contato",
        "meta_description": "Canais oficiais de contato.",
    },
    {
        "title": "Política de Privacidade",
        "slug": "politica-de-privacidade",
        "content": "<h1>Política de Privacidade</h1><p>Esta política descreve como tratamos seus dados.</p>",
        "meta_title": "Política de Privacidade",
        "meta_description": "Como tratamos dados pessoais.",
    },
]


class Command(BaseCommand):
    help = "Cria páginas padrão (Sobre, Contato, Política de Privacidade) para todas as empresas."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Iniciando seed de páginas padrão..."))

        companies = Company.all_companies.all() if hasattr(Company, "all_companies") else Company.objects.all()
        if not companies.exists():
            self.stdout.write(self.style.WARNING("Nenhuma empresa encontrada. Encerrando."))
            return

        total_created = 0
        for company in companies:
            self.stdout.write(f"Processando empresa: {company.name}")
            set_current_company(company)
            for page_data in DEFAULT_PAGES:
                slug = slugify(page_data["slug"])
                page, created = Page.all_objects.get_or_create(
                    company=company,
                    slug=slug,
                    defaults={
                        "title": page_data["title"],
                        "content": page_data["content"],
                        "meta_title": page_data["meta_title"],
                        "meta_description": page_data["meta_description"],
                        "status": Page.STATUS_PUBLISHED,
                    },
                )
                if created:
                    total_created += 1
                    self.stdout.write(self.style.SUCCESS(f"  [+] Página criada: {page.title}"))
                else:
                    self.stdout.write(f"  [.] Página existente: {page.title}")

        self.stdout.write(self.style.SUCCESS(f"Concluído. Total de páginas criadas: {total_created}"))
