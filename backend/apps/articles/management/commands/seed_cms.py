import random

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.articles.models import Article, Category, Tag
from apps.core.models import Company


class Command(BaseCommand):
    help = "Popula o módulo de Artigos com dados iniciais."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Iniciando seed de Artigos..."))

        companies = Company.objects.all()
        if not companies.exists():
            self.stdout.write(self.style.ERROR("Nenhuma empresa encontrada."))
            return

        for company in companies:
            self.stdout.write(f"Semeando empresa: {company.name}")

            # 1. Categorias
            cats = ["Tecnologia", "Negócios", "Inovação", "Marketing"]
            cat_objs = []
            for name in cats:
                obj, _ = Category.objects.get_or_create(
                    company=company,
                    name=name,
                    defaults={"slug": slugify(f"{company.slug}-{name}")}
                )
                cat_objs.append(obj)

            # 2. Tags
            tags = ["SaaS", "Startup", "Gestão", "Dicas", "Produtividade", "Tutorial"]
            tag_objs = []
            for name in tags:
                obj, _ = Tag.objects.get_or_create(
                    company=company,
                    name=name,
                    defaults={"slug": slugify(f"{company.slug}-{name}")}
                )
                tag_objs.append(obj)

            # 3. Usuário Autor
            author = User.all_objects.filter(company=company).first()
            if not author:
                continue

            # 4. Artigos
            for i in range(1, 10):
                title = f"Artigo de Exemplo {i} - {company.name}"
                Article.objects.get_or_create(
                    company=company,
                    slug=slugify(title),
                    defaults={
                        "title": title,
                        "content": f"<p>Conteúdo do artigo de exemplo {i}. Este é um texto gerado automaticamente para testes.</p>",
                        "excerpt": f"Resumo do artigo {i}.",
                        "status": "published",
                        "is_public": True,
                        "author": author,
                        "category": random.choice(cat_objs),
                        "published_at": timezone.now()
                    }
                )

        self.stdout.write(self.style.SUCCESS("Seed de Artigos concluído!"))
