from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.articles.models import Article, ArticleView
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule


class ArticleAnalyticsAggregationTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Analytics Corp", slug="analytics")
        mod = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company, module=mod, is_active=True)
        self.user = User.objects.create_user(
            username="analyst",
            password="password",
            company=self.company,
            is_staff=True,
            is_superuser=True,  # Simplificar para testes de analytics
        )
        self.article = Article.objects.create(
            title="Data Science",
            slug="data-science",
            content="Context",
            author=self.user,
            company=self.company,
            status="PUBLISHED",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_engagement_calculation(self):
        """Testa se o endpoint de analytics calcula corretamente visualizações únicas."""
        # Criar views em momentos diferentes
        ArticleView.objects.create(article=self.article, company=self.company, ip_address="1.1.1.1")
        ArticleView.objects.create(article=self.article, company=self.company, ip_address="1.1.1.2")
        # Mesma IP -> não deve contar como única dependendo da lógica (aqui mockamos 2 IPs)

        response = self.client.get(
            f"/api/articles/articles/{self.article.slug}/analytics_detail/", HTTP_X_COMPANY_SLUG="analytics"
        )

        self.assertEqual(response.status_code, 200)
        data = response.data

        # Verificar se as chaves básicas existem
        self.assertIn("total_views", data)
        self.assertIn("unique_visitors", data)
        self.assertEqual(data["total_views"], 2)
        # Se nossa lógica de 'unique_visitors' for baseada em IP exato no DB:
        self.assertEqual(data["unique_visitors"], 2)
