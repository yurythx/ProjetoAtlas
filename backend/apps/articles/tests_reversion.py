from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.articles.services import ArticleService
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ArticlesReversionTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Rev Corp", slug="rev-corp")
        self.user = User.all_objects.create_user(
            username="revuser", email="rev@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="rev-corp")

        mod = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company, module=mod, is_active=True)

    def test_revert_article_version(self):
        # Create article via service to ensure versioning
        article = ArticleService.create_article(
            user=self.user,
            company=self.company,
            data={"title": "Initial", "slug": "rev-1", "content": "A"},
        )
        # Update article to create another revision
        ArticleService.update_article(self.user, article, {"title": "Changed", "content": "B"})

        # Find a previous version id
        from reversion.models import Version

        versions = Version.objects.get_for_object(article)
        self.assertGreaterEqual(versions.count(), 2)
        older_version = versions.last()  # Oldest revision

        # Revert to oldest version
        reverted = ArticleService.revert_to_version(self.user, article, older_version.id)
        self.assertEqual(reverted.title, "Initial")
        self.assertEqual(reverted.content, "A")
