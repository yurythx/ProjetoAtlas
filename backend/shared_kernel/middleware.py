import logging

from django.db import models

from shared_kernel.tenant_context import set_current_company

logger = logging.getLogger(__name__)


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.conf import settings
        from django.core.cache import caches

        from apps.core.models import Company

        # Disable cache in tests to avoid stale ID issues between test runs
        use_cache = not getattr(settings, "TESTING", False)
        cache = caches["tenants"] if use_cache else None

        if request.path.startswith("/api/core/health/") or request.path.startswith("/api/health/") or request.path.startswith("/health/"):
            set_current_company(None)
            request.company = None
            return self.get_response(request)

        host = request.get_host().split(":")[0]
        company = None

        # 1. Tenta pegar pelo header (dev/mobile/testes)
        slug_header = request.headers.get("x-company-slug") or request.headers.get("X-Company-Slug")

        # 1.5. Tenta pegar por Query Param (útil para debug/testes)
        slug_query = request.GET.get("company_slug")

        slug = slug_header or slug_query

        def set_company_in_cache(c, key):
            # Armazena apenas dados essenciais para reconstruir o objeto básico
            # Evita serializar o objeto completo do Django (detalhes de conexão ao DB)
            data = {"id": str(c.id), "slug": c.slug, "name": c.name}
            cache.set(key, data, timeout=3600)

        def get_company_from_cache(key):
            data = cache.get(key)
            if not data:
                return None
            try:
                return Company.objects.select_related("theme_branding").get(pk=data["id"])
            except Company.DoesNotExist:
                cache.delete(key)
                return None

        if slug:
            cache_key = f"company_slug:{slug}"
            company = get_company_from_cache(cache_key) if use_cache else None
            if not company:
                company = Company.objects.select_related("theme_branding").filter(slug=slug).first()
                if company and use_cache:
                    set_company_in_cache(company, cache_key)

        # 2. Se não achou pelo slug, tenta pelo Host (Domínio Customizado)
        if not company:
            cache_key_host = f"company_host:{host}"
            company = get_company_from_cache(cache_key_host) if use_cache else None
            if not company:
                company = Company.objects.select_related("theme_branding").filter(models.Q(domain__iexact=host)).first()

                if not company:
                    parts = host.split(".")
                    if len(parts) >= 3:
                        base_host = ".".join(parts[1:])
                        company = Company.objects.select_related("theme_branding").filter(models.Q(domain__iexact=base_host)).first()

                        if not company:
                            prefixes = {"api", "app", "www", "dashboard", "admin"}
                            for part in parts:
                                if part.lower() not in prefixes and len(part) > 2:
                                    company = Company.objects.select_related("theme_branding").filter(slug=part).first()
                                    if company:
                                        break

                        if not company and host == "localhost":
                            slug_query = request.GET.get("company_slug")
                            if slug_query:
                                company = Company.objects.select_related("theme_branding").filter(slug=slug_query).first()
                    elif len(parts) == 2:
                        company = Company.objects.select_related("theme_branding").filter(slug=parts[0]).first()

                if company and use_cache:
                    set_company_in_cache(company, cache_key_host)
            else:
                logger.debug(f"TenantMiddleware: Company matching host '{host}' found in cache.")

        if not company:
            # Fallback for localhost/local testing with ports
            slug_query = request.GET.get("company_slug")
            if slug_query:
                company = Company.objects.filter(slug=slug_query).first()
                if company:
                    logger.debug(f"TenantMiddleware: Identificado via query param: {company.slug}")

        request.company = company
        set_current_company(company)

        if not company and not request.path.startswith("/api/accounts/"):
            # Se não identificou mas não é auth, pode ser um problema ou um acesso cross-tenant
            # Registramos no log para depuração
            logger.warning(f"TenantMiddleware: Contexto de tenant ausente para: {request.path} (Host: {host})")

        response = self.get_response(request)
        return response


class TenantSecurityMiddleware:
    """
    Ensures that the authenticated user belongs to the requested tenant (company).
    Must be placed AFTER AuthenticationMiddleware and TenantMiddleware.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.http import JsonResponse

        from shared_kernel.tenant_context import set_current_company

        # Safety Net: Se o TenantMiddleware falhou em identificar a empresa por host/header,
        # mas o usuário está autenticado, assumimos a empresa dele como contexto.
        # Isso resolve 404s em ambientes onde a identificação por DNS não é trivial.
        if request.user.is_authenticated and (not hasattr(request, "company") or not request.company):
            user_company = getattr(request.user, "company", None)
            if user_company:
                request.company = user_company
                set_current_company(user_company)
                logger.debug(f"TenantSecurityMiddleware: Fallback para empresa do usuário: {user_company.slug}")

        # Skip for unauthenticated users or if no company context
        if not request.user.is_authenticated or not hasattr(request, "company") or not request.company:
            return self.get_response(request)

        # Superusers and Staff can access any tenant (for support/admin purposes)
        if request.user.is_superuser or request.user.is_staff:
            return self.get_response(request)

        # Guard: user may have no company (created via shell, incomplete onboarding, etc.)
        user_company_id = getattr(request.user, "company_id", None)
        if not user_company_id:
            return self.get_response(request)

        # Compare IDs only — avoids extra DB hit and instance-comparison bugs
        if user_company_id != request.company.id:
            # Lazy-load slug only for the error message, not for comparison
            try:
                user_slug = request.user.company.slug
            except Exception:
                user_slug = str(user_company_id)

            return JsonResponse(
                {
                    "error": "Cross-Tenant Access Denied",
                    "message": (f"You belong to '{user_slug}' but are trying to access '{request.company.slug}'."),
                },
                status=403,
            )

        return self.get_response(request)


class LicensingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.conf import settings
        from django.http import JsonResponse

        from apps.licensing.utils import check_feature_permission

        if not getattr(settings, "LICENSING_ENFORCE", False):
            return self.get_response(request)

        # Pula se não houver empresa no contexto (ex: rotas administrativas ou de saúde)
        if not hasattr(request, "company") or not request.company:
            return self.get_response(request)

        path = request.path

        # Mapeamento de caminhos protegidos para códigos de feature
        restrictions = {
            "/api/ai/": "ai_access",
            "/api/api-keys/": "api_access",
            "/api/webhooks/": "api_access",
        }

        for restricted_path, feature_code in restrictions.items():
            if path.startswith(restricted_path):
                if not check_feature_permission(request.company, feature_code):
                    return JsonResponse(
                        {
                            "error": "Recurso premium bloqueado.",
                            "feature": feature_code,
                            "message": f"Seu plano atual não permite acesso a '{feature_code}'. Faça um upgrade para continuar.",
                        },
                        status=403,
                    )

        return self.get_response(request)
