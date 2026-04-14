from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.models import Company

from .models import Module, TenantModule


@receiver(post_save, sender=Company)
def create_default_tenant_modules(sender, instance, created, **kwargs):
    """
    Automatically activate default modules for a newly created company.
    """
    if created:
        default_modules = Module.objects.filter(is_default=True)
        for module in default_modules:
            TenantModule.objects.get_or_create(company=instance, module=module, defaults={"is_active": True})
