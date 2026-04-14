from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ModuleViewSet, TenantModuleViewSet

router = DefaultRouter()
router.register(r"available", ModuleViewSet, basename="available-modules")
router.register(r"my-modules", TenantModuleViewSet, basename="my-modules")

urlpatterns = [
    path("", include(router.urls)),
]
