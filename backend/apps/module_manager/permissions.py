from rest_framework import permissions

from .models import TenantModule


class HasModuleAccess(permissions.BasePermission):
    """
    Check if the tenant has the module enabled.
    Requires the ViewSet to define `module_code`.
    """

    def has_permission(self, request, view):
        # Superuser bypass: suporte/admin podem acessar independentemente do estado do módulo
        if getattr(request.user, "is_superuser", False):
            return True

        if not hasattr(view, "module_code") or not view.module_code:
            return True  # No module restriction defined

        if not getattr(request, "company", None):
            return False  # Must be in a company context

        # Check if module exists and is active for this tenant
        try:
            # We use all_objects to bypass TenantManager auto-filtering because we
            # explicitly filter by request.company here.
            is_allowed = TenantModule.all_objects.filter(
                company=request.company, module__code=view.module_code, is_active=True
            ).exists()

            return is_allowed
        except Exception:
            return False
