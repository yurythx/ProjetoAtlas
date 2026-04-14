from django.db import IntegrityError
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import ActionRolePermission
from apps.module_manager.permissions import HasModuleAccess

from .models import Page
from .serializers import PageSerializer, PublicPageSerializer


@extend_schema_view(
    list=extend_schema(tags=["Public Pages"], description="Lista páginas publicadas sem autenticação"),
    retrieve=extend_schema(tags=["Public Pages"], description="Detalhe de página publicada"),
)
class PublicPageViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PublicPageSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"
    lookup_url_kwarg = "slug"
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["slug"]
    pagination_class = None

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        qs = Page.all_objects.filter(status=Page.STATUS_PUBLISHED)

        if company:
            return qs.filter(company=company).order_by("title")

        company_slug = self.request.query_params.get("company_slug") or self.request.headers.get("X-Company-Slug")
        if company_slug:
            return qs.filter(company__slug=company_slug).order_by("title")

        return Page.all_objects.none()


@extend_schema_view(
    list=extend_schema(tags=["CMS"]),
    retrieve=extend_schema(tags=["CMS"]),
    create=extend_schema(tags=["CMS"]),
    update=extend_schema(tags=["CMS"]),
    partial_update=extend_schema(tags=["CMS"]),
    destroy=extend_schema(tags=["CMS"]),
)
class PageViewSet(viewsets.ModelViewSet):
    """
    Gerencia páginas do CMS.
    """

    serializer_class = PageSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    action_permissions = {
        'list': 'pages.page_view',
        'retrieve': 'pages.page_view',
        'create': 'pages.page_create',
        'update': 'pages.page_edit',
        'partial_update': 'pages.page_edit',
        'destroy': 'pages.page_delete',
    }
    module_code = "pages"
    from config.pagination import DefaultPagination

    pagination_class = DefaultPagination

    def get_queryset(self):
        return Page.objects.filter(company=self.request.company).order_by("title")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response({"detail": "Slug já existe para esta empresa."}, status=status.HTTP_400_BAD_REQUEST)
