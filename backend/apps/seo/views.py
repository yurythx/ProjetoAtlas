from django.contrib.sitemaps.views import sitemap
from django.http import HttpResponse
from django.views.decorators.http import require_GET

from .sitemaps import ArticleSitemap, PageSitemap


@require_GET
def robots_txt(request):
    """
    Gera um robots.txt dinâmico baseado no tenant.
    """
    domain = request.get_host()

    lines = [
        "User-agent: *",
        "Disallow: /admin/",
        "Disallow: /api/",
        f"Sitemap: https://{domain}/sitemap.xml",
    ]

    return HttpResponse("\n".join(lines), content_type="text/plain")


@require_GET
def dynamic_sitemap(request):
    """
    Gera o sitemap.xml filtrado pelo tenant atual.
    """
    company = getattr(request, "company", None)

    sitemaps = {
        "articles": ArticleSitemap(company=company),
        "pages": PageSitemap(company=company),
    }

    return sitemap(request, sitemaps=sitemaps)
