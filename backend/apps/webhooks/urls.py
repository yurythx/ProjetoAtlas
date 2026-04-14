from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import WebhookSubscriptionViewSet

router = DefaultRouter()
router.register(r"subscriptions", WebhookSubscriptionViewSet, basename="webhook-subscription")

urlpatterns = [
    path("", include(router.urls)),
]
