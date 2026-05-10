from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
import django_prometheus.urls

from apps.core.health_view import health_check
from apps.core.media_proxy import MediaProxyView
from apps.crm.views import IntegrationGLPITicketWebhookAPIView, IntegrationSyncCardAPIView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health_check"),
    path("health/", health_check, name="health_check_legacy"),
    # Media Proxy
    path("media/<path:path>", MediaProxyView.as_view(), name="media_proxy"),
    # Versioned API — /api/ is the v1 alias for backward compatibility; /api/v1/ is canonical
    path("api/", include("config.api_urls")),
    path("api/v1/", include("config.api_urls")),
    # Integration webhooks (external clients already use these v1 URLs — keep as-is)
    path("api/v1/integration/sync-card/", IntegrationSyncCardAPIView.as_view(), name="crm-sync-card"),
    path("api/v1/integration/glpi/tickets/", IntegrationGLPITicketWebhookAPIView.as_view(), name="crm-glpi-ticket-webhook"),
    # Documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # Sitemap & Robots
    path("", include("apps.seo.urls")),
    # Prometheus metrics endpoint (scraped by prometheus service)
    path("", include(django_prometheus.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
