from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import HasRolePermission
from config.pagination import DefaultPagination
from shared_kernel.cache import invalidate_tenant_cache, tenant_cached

from .models import Module, TenantModule
from .serializers import ModuleSerializer, TenantModuleSerializer


class ModuleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lista todos os módulos disponíveis no sistema.
    """

    queryset = Module.objects.all().order_by("name")
    serializer_class = ModuleSerializer
    permission_classes = [permissions.AllowAny]


class TenantModuleViewSet(viewsets.ModelViewSet):
    """
    Gerencia os módulos ativados para o tenant atual.
    """

    serializer_class = TenantModuleSerializer
    pagination_class = DefaultPagination
    required_permission = "admin.settings_manage"

    def _get_company(self):
        company = getattr(self.request, "company", None)
        if not company and getattr(self.request, "user", None) and getattr(self.request.user, "company", None):
            company = self.request.user.company
        if not company:
            raise ValidationError(
                {"detail": "Contexto de empresa ausente. Defina X-Company-Slug ou vincule o usuário a uma empresa."}
            )
        return company

    def _ensure_default_modules(self, company):
        default_ids = list(Module.objects.filter(is_default=True).values_list("id", flat=True))
        if not default_ids:
            return False

        existing = set(
            TenantModule.all_objects.filter(company=company, module_id__in=default_ids).values_list(
                "module_id", flat=True
            )
        )
        missing = [mid for mid in default_ids if mid not in existing]
        if not missing:
            return False

        created_any = False
        for module in Module.objects.filter(id__in=missing):
            _, created = TenantModule.all_objects.get_or_create(
                company=company,
                module=module,
                defaults={"is_active": True},
            )
            created_any = created_any or created
        return created_any

    def get_authenticators(self):
        path = getattr(getattr(self, "request", None), "path", "") or ""
        method = getattr(getattr(self, "request", None), "method", "") or ""
        if method in ("GET", "HEAD", "OPTIONS") and path.startswith("/api/modules/my-modules"):
            return []
        return super().get_authenticators()

    def get_permissions(self):
        path = getattr(getattr(self, "request", None), "path", "") or ""
        method = getattr(getattr(self, "request", None), "method", "") or ""
        if method in ("GET", "HEAD", "OPTIONS") and path.startswith("/api/modules/my-modules"):
            # Permitir que visitantes vejam quais módulos estão ativos para o portal
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated(), HasRolePermission()]

    @tenant_cached(timeout=3600, key_prefix="modules_v2")
    def list(self, request, *args, **kwargs):
        try:
            company = getattr(request, "company", None) or (
                request.user.company if getattr(request, "user", None) and request.user.is_authenticated else None
            )
            if company:
                created = self._ensure_default_modules(company)
                if created:
                    invalidate_tenant_cache("modules_v2", company.slug)
        except Exception:
            pass
        return super().list(request, *args, **kwargs)

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company and getattr(self.request, "user", None) and getattr(self.request.user, "company", None):
            company = self.request.user.company
        if not company:
            return TenantModule.objects.none()
        return TenantModule.objects.select_related("module").filter(company=company).order_by("module__name")

    def perform_create(self, serializer):
        company = self._get_company()
        serializer.save(company=company)
        invalidate_tenant_cache("modules_v2", company.slug)

    def perform_update(self, serializer):
        serializer.save()
        company = getattr(self.request, "company", None) or getattr(
            getattr(self.request, "user", None), "company", None
        )
        if company:
            invalidate_tenant_cache("modules_v2", company.slug)

    # I-M1: invalidar cache também no destroy para evitar stale de até 1h
    def perform_destroy(self, instance):
        company = getattr(self.request, "company", None) or getattr(
            getattr(self.request, "user", None), "company", None
        )
        company_slug = company.slug if company else None
        instance.delete()
        if company_slug:
            invalidate_tenant_cache("modules_v2", company_slug)

    @action(detail=False, methods=["post"], url_path="activate")
    def activate_module(self, request):
        """
        Endpoint conveniente para ativar um módulo pelo código.
        Body: { "module_code": "messenger" }
        """
        module_code = request.data.get("module_code")
        if not module_code:
            return Response({"error": "module_code required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            module = Module.objects.get(code=module_code)
        except Module.DoesNotExist:
            return Response({"error": "Module not found"}, status=status.HTTP_404_NOT_FOUND)

        company = getattr(request, "company", None) or getattr(getattr(request, "user", None), "company", None)
        if not company:
            raise ValidationError(
                {"detail": "Contexto de empresa ausente. Defina X-Company-Slug ou vincule o usuário a uma empresa."}
            )

        tenant_module, created = TenantModule.objects.get_or_create(
            company=company, module=module, defaults={"is_active": True}
        )

        if not created and not tenant_module.is_active:
            tenant_module.is_active = True
            tenant_module.save()

        invalidate_tenant_cache("modules_v2", company.slug)

        serializer = self.get_serializer(tenant_module)
        return Response(serializer.data, status=status.HTTP_200_OK)
