from django.core.management.base import BaseCommand

from apps.articles.models import Article
from apps.pages.models import Page


class Command(BaseCommand):
    help = "Audita a consistência entre visibilidade pública e status de publicação."

    def add_arguments(self, parser):
        parser.add_argument(
            "--fix",
            action="store_true",
            help="Aplica correções automáticas para as inconsistências encontradas.",
        )

    def handle(self, *args, **options):
        fix = options["fix"]
        self.stdout.write("Iniciando auditoria de consistência...")

        # 1. Auditoria de Artigos
        inconsistent_articles = Article.objects.filter(is_public=True).exclude(status="published")

        if inconsistent_articles.exists():
            self.stdout.write(
                self.style.WARNING(f"Artigos: Encontrados {inconsistent_articles.count()} itens inconsistentes!")
            )
            for art in inconsistent_articles:
                self.stdout.write(f"  - Artigo [{art.id}]: {art.title} (Status: {art.status})")
                if fix:
                    art.is_public = False
                    art.save(update_fields=["is_public"])
                    self.stdout.write(self.style.SUCCESS("    [FIX] Visibilidade pública removida."))
        else:
            self.stdout.write(self.style.SUCCESS("Artigos: Tudo OK."))

        # 2. Auditoria de Páginas (Páginas agora usam status)
        inconsistent_pages = Page.objects.exclude(status="published")
        # Se uma página não está publicada mas o slug indica que ela deveria ser visível
        # (por enquanto páginas não tem flag is_public, mas vamos garantir o status)

        # Na verdade, páginas públicas no nosso sistema são apenas as publicadas.
        # Vamos apenas logar se houver algo estranho.
        if inconsistent_pages.exists():
            self.stdout.write(f"Informação: Existem {inconsistent_pages.count()} páginas em rascunho/não publicadas.")

        self.stdout.write("Auditoria concluída.")
