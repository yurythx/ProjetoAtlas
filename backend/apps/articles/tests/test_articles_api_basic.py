from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.articles.models import Article, Category
from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ArticleAPITest(APITestCase):
    def setUp(self):
        self.company1 = Company.objects.create(name="Company 1", slug="company-1")
        self.company2 = Company.objects.create(name="Company 2", slug="company-2")

        self.module = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company1, module=self.module, is_active=True)
        TenantModule.objects.create(company=self.company2, module=self.module, is_active=True)

        self.feat_articles = Feature.objects.create(code="max_articles", name="Max Articles")
        self.feat_users = Feature.objects.create(code="max_users", name="Max Users")
        self.plan = Plan.objects.create(name="Enterprise")
        PlanFeature.objects.create(plan=self.plan, feature=self.feat_articles, value="unlimited")
        PlanFeature.objects.create(plan=self.plan, feature=self.feat_users, value="unlimited")

        License.objects.create(company=self.company1, plan=self.plan, is_active=True)
        License.objects.create(company=self.company2, plan=self.plan, is_active=True)

        self.role1 = Role.objects.create(
            company=self.company1,
            name="Admin",
            permissions=["articles.comment_moderate", "articles.article_view"],
        )
        self.role2 = Role.objects.create(
            company=self.company2,
            name="Admin",
            permissions=["articles.comment_moderate", "articles.article_view"],
        )

        self.user1 = User.objects.create_user(
            username="user1",
            password="password",
            company=self.company1,
            role=self.role1,
        )
        self.user2 = User.objects.create_user(
            username="user2",
            password="password",
            company=self.company2,
            role=self.role2,
        )

        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company1.slug)

        self.cat1 = Category.objects.create(name="Cat 1", slug="cat-1", company=self.company1)
        self.article1 = Article.objects.create(
            title="Article 1",
            slug="article-1",
            content="Content 1",
            company=self.company1,
            category=self.cat1,
            author=self.user1,
        )

    def test_tenant_isolation_list(self):
        self.client.force_authenticate(user=self.user1)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company1.slug)
        response = self.client.get("/api/articles/articles/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Article 1")

        self.client.force_authenticate(user=self.user2)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company2.slug)
        response = self.client.get("/api/articles/articles/")

        data = response.data
        results = data["results"] if isinstance(data, dict) and "results" in data else data
        self.assertEqual(len(results), 0)

    def test_tenant_isolation_detail(self):
        self.client.force_authenticate(user=self.user2)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company2.slug)
        response = self.client.get(f"/api/articles/articles/{self.article1.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
