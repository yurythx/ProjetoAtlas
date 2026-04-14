from rest_framework.throttling import SimpleRateThrottle


class TenantRateThrottle(SimpleRateThrottle):
    """
    Limits the rate of API calls per tenant.
    """

    scope = "tenant"

    def get_cache_key(self, request, view):
        # Se não tem tenant, usa IP (anon behavior)
        company = getattr(request, "company", None)

        if not company:
            # Fallback para IP se não estiver em contexto de empresa
            ident = self.get_ident(request)
            return self.cache_format % {"scope": "anon", "ident": ident}

        # Key format: throttle:tenant:company_slug
        return self.cache_format % {"scope": self.scope, "ident": company.slug}
