import logging

from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)


class TenantQuerySet(models.QuerySet):
    def for_company(self, company):
        return self.filter(company=company)


class TenantManager(models.Manager):
    def get_queryset(self):
        from shared_kernel.tenant_context import get_current_company

        company = get_current_company()
        qs = super().get_queryset()
        if company:
            return qs.filter(company=company)
        # Safe fallback: return nothing when company context is missing.
        # Log at DEBUG so developers can detect queries outside expected context.
        logger.debug(
            "TenantManager.get_queryset called without company context — returning empty QuerySet. "
            "This is expected for superuser/management commands; may indicate a bug elsewhere.",
            stack_info=True,
        )
        return qs.none()


class BaseTenantModel(models.Model):
    company = models.ForeignKey("core.Company", on_delete=models.CASCADE, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = TenantManager()
    all_objects = models.Manager()

    class Meta:
        abstract = True
