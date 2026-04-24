from functools import wraps

from django.core.cache import cache
from rest_framework.response import Response

from shared_kernel.tenant_context import get_current_company


def tenant_cached(timeout=3600, key_prefix=""):
    """
    Decorator to cache response data per tenant.
    """

    def decorator(func):
        @wraps(func)
        def wrapper(self, request, *args, **kwargs):
            try:
                company = get_current_company()
                if not company:
                    return func(self, request, *args, **kwargs)

                # Create a unique key for this view, action, and tenant
                cache_key = f"{key_prefix}:{func.__name__}:{company.slug}"

                cached_data = cache.get(cache_key)
                if cached_data is not None:
                    if isinstance(cached_data, (dict, list)):
                        return Response(cached_data)
                    return cached_data

                response = func(self, request, *args, **kwargs)

                # Only cache successful responses
                if hasattr(response, "status_code") and response.status_code == 200:
                    cache.set(cache_key, response.data, timeout)

                return response
            except Exception as e:
                # Se falhar o cache ou contexto, executa a função sem cache para evitar 500
                import logging

                logger = logging.getLogger(__name__)
                logger.error(f"Cache error in {func.__name__}: {e!s}")
                return func(self, request, *args, **kwargs)

        return wrapper

    return decorator


def invalidate_tenant_cache(key_prefix, company_slug):
    """
    Invalidates all keys for a specific tenant and prefix.
    Note: In a real production scenario with many keys,
    we might need a more efficient way to invalidate by pattern.
    """
    # This is a simplified version. django-redis supports cache.delete_pattern()
    if hasattr(cache, "delete_pattern"):
        cache.delete_pattern(f"*{key_prefix}*:{company_slug}*")
    else:
        # Fallback for LocMemCache/DummyCache: delete the most common list key
        # if the prefix matches our module manager conventions.
        if "modules" in key_prefix:
            cache.delete(f"{key_prefix}:list:{company_slug}")
            cache.delete(f"modules:list:{company_slug}")
