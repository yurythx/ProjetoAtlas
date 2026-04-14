from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ArticleViewSet,
    CategoryViewSet,
    CommentViewSet,
    PublicArticleViewSet,
    PublicCategoryViewSet,
    PublicCommentViewSet,
    TagViewSet,
)

# Router principal (autenticado)
router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="categories")
router.register(r"tags", TagViewSet, basename="tags")
router.register(r"articles", ArticleViewSet, basename="articles")
router.register(r"comments", CommentViewSet, basename="comments")

# Router público (sem autenticação)
public_router = DefaultRouter()
public_router.register(r"articles", PublicArticleViewSet, basename="public-articles")
public_router.register(r"categories", PublicCategoryViewSet, basename="public-categories")
public_router.register(r"comments", PublicCommentViewSet, basename="public-comments")

urlpatterns = [
    path("public/", include(public_router.urls)),
    path("", include(router.urls)),
]
