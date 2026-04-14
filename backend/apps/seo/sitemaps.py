from django.contrib.sitemaps import Sitemap

from apps.articles.models import Article
from apps.pages.models import Page


class ArticleSitemap(Sitemap):
    changefreq = "weekly"
    priority = 0.7

    def __init__(self, company=None):
        self.company = company

    def items(self):
        qs = Article.objects.filter(status=Article.STATUS_PUBLISHED)
        if self.company:
            qs = qs.filter(company=self.company)
        return qs

    def lastmod(self, obj):
        return obj.updated_at

    def location(self, obj):
        # This should return the frontend URL
        # For multi-tenant, it depends on how the frontend routing is set up
        # If it's custom domains or path based
        return f"/p/artigos/{obj.slug}"


class PageSitemap(Sitemap):
    changefreq = "monthly"
    priority = 0.5

    def __init__(self, company=None):
        self.company = company

    def items(self):
        qs = Page.objects.filter(status=Page.STATUS_PUBLISHED)
        if self.company:
            qs = qs.filter(company=self.company)
        return qs

    def lastmod(self, obj):
        return obj.updated_at

    def location(self, obj):
        return f"/p/paginas/{obj.slug}"
