from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.articles.models import Article, Category
from apps.articles.services import ArticleService
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ArticleStatusFlowTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Flow Corp", slug="flow-corp")
        self.user = User.all_objects.create_user(
            username="flowuser", email="flow@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="flow-corp")

        mod = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company, module=mod, is_active=True)

        self.category = Category.objects.create(company=self.company, name="News", slug="news")

    def test_draft_to_pending_to_published(self):
        article = ArticleService.create_article(
            user=self.user,
            company=self.company,
            data={"title": "Flow", "slug": "flow-article", "content": "x", "category": self.category},
        )
        self.assertEqual(article.status, Article.STATUS_DRAFT)

        # Submit for review
        article = ArticleService.submit_for_review(self.user, article)
        self.assertEqual(article.status, Article.STATUS_PENDING)

        # Publish
        article = ArticleService.publish_article(self.user, article)
        self.assertEqual(article.status, Article.STATUS_PUBLISHED)
        self.assertIsNotNone(article.published_at)

    def test_reject_only_pending(self):
        article = ArticleService.create_article(
            user=self.user,
            company=self.company,
            data={"title": "Reject Me", "slug": "reject-me", "content": "y", "category": self.category},
        )
        # Rejecting draft should raise
        with self.assertRaises(ValueError):
            ArticleService.reject_article(self.user, article)

        # Move to pending then reject
        article = ArticleService.submit_for_review(self.user, article)
        article = ArticleService.reject_article(self.user, article)
        self.assertEqual(article.status, Article.STATUS_REJECTED)
