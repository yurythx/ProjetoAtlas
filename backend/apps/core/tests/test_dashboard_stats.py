from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.articles.models import Article, ArticleView
from apps.core.models import Company

User = get_user_model()


class DashboardStatsViewTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Dash Co", slug="dash-co")
        role = Role.all_objects.create(company=self.company, name="Admin", permissions=["admin.view_dashboard"])
        self.user = User.objects.create_user(
            username="dash", email="dash@co.com", password="pass", company=self.company, is_staff=True, role=role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="dash-co")

        self.article = Article.objects.create(
            company=self.company,
            author=self.user,
            title="A",
            slug="a",
            content="c",
            status=Article.STATUS_PUBLISHED,
            is_public=True,
        )
        ArticleView.objects.create(company=self.company, article=self.article, ip_address="1.1.1.1", user=self.user)

    def test_dashboard_stats_views_series_shape(self):
        res = self.client.get("/api/core/dashboard/stats/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data

        self.assertIn("charts", data)
        self.assertIn("views_series", data["charts"])
        views_series = data["charts"]["views_series"]
        self.assertIsInstance(views_series, list)
        self.assertGreaterEqual(len(views_series), 1)

        first = views_series[0]
        self.assertIn("date", first)
        self.assertIn("count", first)
        self.assertNotIn("name", first)
        self.assertNotIn("value", first)
