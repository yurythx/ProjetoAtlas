# Cache Invalidation Signals for Multi-Tenancy
"""
Automatic cache invalidation when Company or TenantBranding is updated.
Ensures cached data stays fresh without manual cache management.
"""

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from apps.core.models import Company, TenantBranding, TenantEmailConfig


@receiver(post_save, sender=Company)
def invalidate_company_cache(sender, instance, **kwargs):
    """Invalidate company cache when Company is saved."""
    cache_key = f"company:slug:{instance.slug}"
    cache.delete(cache_key)


@receiver(post_delete, sender=Company)
def invalidate_company_cache_on_delete(sender, instance, **kwargs):
    """Invalidate company cache when Company is deleted."""
    cache_key = f"company:slug:{instance.slug}"
    cache.delete(cache_key)


@receiver(post_save, sender=TenantBranding)
def invalidate_branding_cache(sender, instance, **kwargs):
    """Invalidate company cache when TenantBranding is updated (affects Company.theme_branding)."""
    cache_key = f"company:slug:{instance.company.slug}"
    cache.delete(cache_key)


@receiver(post_save, sender=TenantEmailConfig)
def invalidate_email_config_cache(sender, instance, **kwargs):
    """Invalidate company cache when TenantEmailConfig is updated (affects Company.email_config)."""
    cache_key = f"company:slug:{instance.company.slug}"
    cache.delete(cache_key)
