from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


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


class WebhookInboundThrottle(SimpleRateThrottle):
    """
    Rate limiting for inbound webhook endpoints (GLPI, Evolution, etc.).
    Keyed per API Key prefix + company to prevent abuse while allowing
    legitimate high-frequency integrations.
    Default: 300 requests/minute (configurable via REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']).
    """

    scope = "webhook_inbound"

    def get_cache_key(self, request, view):
        company = getattr(request, "company", None)
        company_slug = company.slug if company else self.get_ident(request)

        # If authenticated via API Key, include prefix in cache key
        auth = getattr(request, "auth", None)
        prefix = getattr(auth, "prefix", "") if auth else ""
        ident = f"{company_slug}:{prefix}" if prefix else company_slug

        return self.cache_format % {"scope": self.scope, "ident": ident}
