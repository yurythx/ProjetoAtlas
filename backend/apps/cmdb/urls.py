from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CITypeViewSet, CIViewSet, CIRelationshipViewSet

router = DefaultRouter()
router.register(r"types", CITypeViewSet)
router.register(r"items", CIViewSet)
router.register(r"relationships", CIRelationshipViewSet)

urlpatterns = [
    path("", include(router.urls)),
]
