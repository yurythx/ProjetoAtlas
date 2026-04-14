from .models import License, PlanFeature


def check_feature_permission(company, feature_code):
    """
    Verifica se uma empresa tem permissão para usar uma feature específica.
    Usa cache para evitar hits repetidos no DB em cada requisição do middleware.
    """
    if not company:
        return False

    from django.core.cache import cache

    cache_key = f"lic:feat:{company.id}:{feature_code}"
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        return cached_val

    active_license = License.objects.filter(company=company, is_active=True).first()
    if not active_license:
        cache.set(cache_key, False, timeout=60)
        return False

    plan_feature = PlanFeature.objects.filter(plan=active_license.plan, feature__code=feature_code).first()

    if not plan_feature:
        cache.set(cache_key, False, timeout=60)
        return False

    value = str(plan_feature.value).lower()
    is_enabled = value in ["true", "unlimited", "yes", "1"]

    if not is_enabled:
        try:
            is_enabled = int(value) > 0
        except ValueError:
            pass

    cache.set(cache_key, is_enabled, timeout=60)
    return is_enabled
