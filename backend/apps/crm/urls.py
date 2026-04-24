from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ColumnViewSet,
    ContactViewSet,
    DPSMDashboardViewSet,
    CRMGroupViewSet,
    CRMIntegrationInboundEventReplayAPIView,
    CRMIntegrationInboundEventsAPIView,
    CRMIntegrationOptionsAPIView,
    CRMSavedViewViewSet,
    DealViewSet,
    EvolutionConfigViewSet,
    IntegrationEvolutionWebhookAPIView,
    PipelineViewSet,
    SLAPolicyViewSet,
    XLAFeedbackViewSet,
    CSIEntryViewSet,
    IntegrationHealthAPIView,
)

router = DefaultRouter()
router.register(r"contacts", ContactViewSet, basename="crm-contact")
router.register(r"saved-views", CRMSavedViewViewSet, basename="crm-saved-view")
router.register(r"groups", CRMGroupViewSet, basename="crm-group")
router.register(r"pipelines", PipelineViewSet, basename="crm-pipeline")
router.register(r"columns", ColumnViewSet, basename="crm-column")
router.register(r"deals", DealViewSet, basename="crm-deal")
router.register(r"sla-policies", SLAPolicyViewSet, basename="crm-sla-policy")
router.register(r"xla-feedbacks", XLAFeedbackViewSet, basename="crm-xla-feedback")
router.register(r"csi-register", CSIEntryViewSet, basename="crm-csi-entry")
router.register(r"dpsm-dashboard", DPSMDashboardViewSet, basename="crm-dpsm-dashboard")
router.register(r"evolution-config", EvolutionConfigViewSet, basename="crm-evolution-config")

urlpatterns = [
    path("integrations/options/", CRMIntegrationOptionsAPIView.as_view(), name="crm-integration-options"),
    path("integrations/inbound/", CRMIntegrationInboundEventsAPIView.as_view(), name="crm-integration-inbound"),
    path("integrations/evolution/<str:webhook_token>/", IntegrationEvolutionWebhookAPIView.as_view(), name="crm-evolution-webhook"),
    path("integrations/inbound/<int:event_id>/replay/", CRMIntegrationInboundEventReplayAPIView.as_view(), name="crm-integration-inbound-replay"),
    path("integrations/health/", IntegrationHealthAPIView.as_view(), name="crm-integration-health"),
    path("", include(router.urls)),
]
