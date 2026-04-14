from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from reversion.models import Version

from apps.accounts.models import Role
from apps.articles.services import ArticleService
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ArticleHistoryAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Hist Corp", slug="hist-corp")
        role, _ = Role.all_objects.get_or_create(
            company=self.company,
            name="Editor",
            defaults={"permissions": ["articles.article_view", "articles.article_edit", "articles.article_create"]},
        )
        if role.permissions != ["articles.article_view", "articles.article_edit", "articles.article_create"]:
            role.permissions = ["articles.article_view", "articles.article_edit", "articles.article_create"]
            role.save(update_fields=["permissions"])
        self.user = User.all_objects.create_user(
            username="histuser", email="h@corp.com", password="pass", company=self.company
        )
        self.user.role = role
        self.user.save(update_fields=["role"])
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="hist-corp")

        mod = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company, module=mod, is_active=True)

        self.article = ArticleService.create_article(
            user=self.user, company=self.company, data={"title": "Title", "slug": "hist-1", "content": "A"}
        )
        self.article = ArticleService.update_article(self.user, self.article, {"title": "Changed"})

    def test_history_and_revert(self):
        res = self.client.get(f"/api/articles/articles/{self.article.slug}/history/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 1)

        versions = Version.objects.get_for_object(self.article)
        target_id = versions.last().id

        revert_res = self.client.post(
            f"/api/articles/articles/{self.article.slug}/revert/", {"version_id": target_id}, format="json"
        )
        self.assertEqual(revert_res.status_code, status.HTTP_200_OK)
