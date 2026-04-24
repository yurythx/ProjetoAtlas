from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from apps.core.health import health_check
from apps.core.media_proxy import MediaProxyView
from apps.crm.views import IntegrationGLPITicketWebhookAPIView, IntegrationSyncCardAPIView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health_check"),
    path("health/", health_check, name="health_check_legacy"),
    # Media Proxy (para servir arquivos do MinIO/S3 via API)
    path("media/<path:path>", MediaProxyView.as_view(), name="media_proxy"),
    # Core APIs
    path("api/core/", include("apps.core.urls")),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/licensing/", include("apps.licensing.urls")),
    path("api/modules/", include("apps.module_manager.urls")),
    path("api/messenger/", include("apps.messenger.urls")),
    path("api/pages/", include("apps.pages.urls")),
    path("api/articles/", include("apps.articles.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/webhooks/", include("apps.webhooks.urls")),
    path("api/api-keys/", include("apps.api_keys.urls")),
    path("api/finance/", include("apps.finance.urls")),
    path("api/calendar/", include("apps.calendar.urls")),
    path("api/payroll/", include("apps.payroll.urls")),
    path("api/media/", include("apps.media.urls")),
    path("api/crm/", include("apps.crm.urls")),
    path("api/service-catalog/", include("apps.service_catalog.urls")),
    path("api/cmdb/", include("apps.cmdb.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/v1/integration/sync-card/", IntegrationSyncCardAPIView.as_view(), name="crm-sync-card"),
    path("api/v1/integration/glpi/tickets/", IntegrationGLPITicketWebhookAPIView.as_view(), name="crm-glpi-ticket-webhook"),
    # Documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # Sitemap & Robots
    path("", include("apps.seo.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
