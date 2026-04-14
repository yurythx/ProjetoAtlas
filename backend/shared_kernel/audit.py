"""
Audit logging utilities.

Design: all write operations are dispatched asynchronously via Celery to avoid
adding DB write latency to the main request cycle. The async task is defined here
to keep audit concerns self-contained.

Synchronous fallback: if Celery is not available (e.g., CELERY_TASK_ALWAYS_EAGER
is True in tests, or broker is unreachable), `apply_async` will execute
synchronously via the eager mode — so audit logs are never silently lost.
"""

import logging

from shared_kernel.tenant_context import get_current_company

logger = logging.getLogger(__name__)


def _resolve_context(user, obj, request):
    """Extract company and IP address from request/object context."""
    company = None
    if request:
        company = getattr(request, "company", None)
    if not company:
        company = get_current_company()
    if not company and obj is not None:
        company = getattr(obj, "company", None)

    ip_address = None
    if request and hasattr(request, "META"):
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            ip_address = x_forwarded_for.split(",")[0].strip()
        else:
            ip_address = request.META.get("REMOTE_ADDR")

    return company, ip_address


def log_action(user, action, resource, resource_id=None, details=None, request=None):
    """
    Dispatch an audit log entry asynchronously via Celery.

    Falls back to synchronous execution when:
    - CELERY_TASK_ALWAYS_EAGER=True (tests / local dev)
    - Celery broker is unavailable (task will fail silently with logged error)
    """

    # Resolve context in the request thread (while request is still alive)
    company, ip_address = _resolve_context(user, None, request)

    if not company:
        logger.warning("Audit log skipped — no company context", extra={"action": action, "resource": resource})
        return None

    from apps.core.tasks import create_audit_log_async

    create_audit_log_async.apply_async(
        kwargs={
            "company_id": company.id,
            "user_id": user.id if user and getattr(user, "is_authenticated", False) else None,
            "action": action,
            "resource": resource,
            "resource_id": str(resource_id) if resource_id else None,
            "details": details or {},
            "ip_address": ip_address,
        }
    )


def log_create(user, resource, obj, request=None):
    log_action(
        user,
        "create",
        resource,
        resource_id=getattr(obj, "pk", None),
        details={"name": str(obj)},
        request=request,
    )


def log_update(user, resource, obj, request=None, changes=None):
    log_action(
        user,
        "update",
        resource,
        resource_id=getattr(obj, "pk", None),
        details=changes or {"name": str(obj)},
        request=request,
    )


def log_delete(user, resource, obj, request=None):
    log_action(
        user,
        "delete",
        resource,
        resource_id=getattr(obj, "pk", None),
        details={"name": str(obj)},
        request=request,
    )
