"""Versioned API routes — included under both /api/ and /api/v1/."""

from django.urls import include, path

urlpatterns = [
    path("core/", include("apps.core.urls")),
    path("accounts/", include("apps.accounts.urls")),
    path("licensing/", include("apps.licensing.urls")),
    path("modules/", include("apps.module_manager.urls")),
    path("messenger/", include("apps.messenger.urls")),
    path("pages/", include("apps.pages.urls")),
    path("articles/", include("apps.articles.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("webhooks/", include("apps.webhooks.urls")),
    path("api-keys/", include("apps.api_keys.urls")),
    path("finance/", include("apps.finance.urls")),
    path("calendar/", include("apps.calendar.urls")),
    path("payroll/", include("apps.payroll.urls")),
    path("media/", include("apps.media.urls")),
    path("crm/", include("apps.crm.urls")),
    path("service-catalog/", include("apps.service_catalog.urls")),
    path("cmdb/", include("apps.cmdb.urls")),
    path("ai/", include("apps.ai.urls")),
    path("reports/", include("apps.reports.urls")),
]
