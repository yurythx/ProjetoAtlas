from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .branding_views import TenantBrandingViewSet
from .health_view import health_check  # re-exported; mounted at /api/core/health/ via api_urls
from .search_views import GlobalSearchViewSet
from .views import AuditLogViewSet, CompanyViewSet, DashboardStatsView, LDAPConfigViewSet, RobotsView, SitemapView

router = DefaultRouter()
router.register(r"companies", CompanyViewSet)
router.register(r"branding", TenantBrandingViewSet)
router.register(r"audit-logs", AuditLogViewSet, basename="audit-logs")
router.register(r"ldap-config", LDAPConfigViewSet, basename="ldap-config")
router.register(r"search", GlobalSearchViewSet, basename="global-search")


urlpatterns = [
    path("health/", health_check, name="health-check"),
    path(
        "ldap-health/",
        lambda request: __import__("apps.core.ldap_health", fromlist=["LDAPHealthCheck"]).LDAPHealthCheck.as_view()(
            request
        ),
        name="ldap-health",
    ),
    path("dashboard/stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("sitemap/", SitemapView.as_view(), name="sitemap"),
    path("robots.txt", RobotsView.as_view(), name="robots-txt"),
    path("", include(router.urls)),
]
