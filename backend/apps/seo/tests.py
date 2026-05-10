"""
Tests for the seo app — robots.txt and sitemap.xml endpoints.

Coverage:
- robots_txt: 200, content-type, required directives, Sitemap line includes host
- dynamic_sitemap: 200, XML content-type, article/page URLs appear for tenant
- Sitemap filters by company: articles from another tenant are excluded
- Empty sitemaps (no published content) return valid XML
"""

from django.test import Client, TestCase
from django.urls import reverse

from factories import ArticleFactory, CompanyFactory, PageFactory, UserFactory


class RobotsTxtTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = reverse("robots_txt")

    def test_returns_200(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)

    def test_content_type_is_plain_text(self):
        res = self.client.get(self.url)
        self.assertIn("text/plain", res["Content-Type"])

    def test_contains_user_agent_wildcard(self):
        res = self.client.get(self.url)
        self.assertIn("User-agent: *", res.content.decode())

    def test_disallows_admin_and_api(self):
        content = self.client.get(self.url).content.decode()
        self.assertIn("Disallow: /admin/", content)
        self.assertIn("Disallow: /api/", content)

    def test_sitemap_line_references_host(self):
        res = self.client.get(self.url, SERVER_NAME="example.com")
        content = res.content.decode()
        self.assertIn("Sitemap:", content)
        self.assertIn("example.com", content)
        self.assertIn("sitemap.xml", content)

    def test_only_get_allowed(self):
        res = self.client.post(self.url)
        self.assertEqual(res.status_code, 405)


class DynamicSitemapTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = reverse("sitemap_xml")
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)

    def _get_with_company(self):
        return self.client.get(
            self.url,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

    def test_returns_200(self):
        res = self._get_with_company()
        self.assertEqual(res.status_code, 200)

    def test_content_type_is_xml(self):
        res = self._get_with_company()
        self.assertIn("xml", res["Content-Type"])

    def test_published_article_appears_in_sitemap(self):
        article = ArticleFactory(
            company=self.company,
            author=self.user,
            status="published",
            slug="my-test-article",
        )
        res = self._get_with_company()
        content = res.content.decode()
        self.assertIn(article.slug, content)

    def test_draft_article_excluded_from_sitemap(self):
        draft = ArticleFactory(
            company=self.company,
            author=self.user,
            status="draft",
            slug="hidden-draft",
        )
        res = self._get_with_company()
        self.assertNotIn(draft.slug, res.content.decode())

    def test_published_page_appears_in_sitemap(self):
        page = PageFactory(
            company=self.company,
            status="published",
            slug="my-test-page",
        )
        res = self._get_with_company()
        self.assertIn(page.slug, res.content.decode())

    def test_other_company_articles_excluded(self):
        other_company = CompanyFactory()
        other_user = UserFactory(company=other_company)
        other_article = ArticleFactory(
            company=other_company,
            author=other_user,
            status="published",
            slug="other-company-article",
        )
        res = self._get_with_company()
        self.assertNotIn(other_article.slug, res.content.decode())

    def test_empty_sitemap_is_valid_xml(self):
        # No articles or pages — should still return valid XML
        res = self._get_with_company()
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"<?xml", res.content)

    def test_sitemap_without_company_context_returns_all_published(self):
        article = ArticleFactory(
            company=self.company,
            author=self.user,
            status="published",
            slug="global-article",
        )
        # No X-Company-Slug header → company=None → no filter applied
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        self.assertIn(article.slug, res.content.decode())
