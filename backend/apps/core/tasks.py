"""
Celery tasks for the core app.

Contains background tasks related to auditing and housekeeping.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="core.create_audit_log",
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    ignore_result=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def create_audit_log_async(
    self,
    company_id: int,
    user_id,
    action: str,
    resource: str,
    resource_id=None,
    details=None,
    ip_address=None,
):
    """
    Persist an audit log entry to the database asynchronously.

    This task is dispatched by shared_kernel.audit and runs in the Celery
    worker process, keeping audit DB writes off the main request/response cycle.

    Retries up to 3 times with exponential backoff on any exception.
    """
    from django.contrib.auth import get_user_model

    from apps.core.models import AuditLog, Company

    User = get_user_model()

    try:
        company = Company.objects.get(pk=company_id)
    except Company.DoesNotExist:
        logger.error(
            "AuditLog task: company not found",
            extra={"company_id": company_id, "action": action},
        )
        return

    user = None
    if user_id is not None:
        try:
            user = User.all_objects.get(pk=user_id)
        except User.DoesNotExist:
            logger.warning(
                "AuditLog task: user not found, logging without user",
                extra={"user_id": user_id},
            )

    AuditLog.objects.create(
        company=company,
        user=user,
        action=action,
        resource=resource,
        resource_id=str(resource_id) if resource_id else None,
        details=details or {},
        ip_address=ip_address,
    )
    logger.debug(
        "Audit log created",
        extra={"company_id": company_id, "action": action, "resource": resource},
    )
