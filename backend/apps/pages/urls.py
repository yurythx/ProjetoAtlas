from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PageViewSet, PublicPageViewSet

router = DefaultRouter()
router.register(r"", PageViewSet, basename="pages")

public_router = DefaultRouter()
public_router.register(r"pages", PublicPageViewSet, basename="public-pages")

urlpatterns = [
    path("public/", include(public_router.urls)),
    path("", include(router.urls)),
]
