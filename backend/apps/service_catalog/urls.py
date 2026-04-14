from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ServiceCategoryViewSet, ServiceDefinitionViewSet, ServiceItemViewSet

router = DefaultRouter()
router.register(r"categories", ServiceCategoryViewSet)
router.register(r"definitions", ServiceDefinitionViewSet)
router.register(r"items", ServiceItemViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
