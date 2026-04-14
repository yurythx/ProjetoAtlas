from django.contrib.auth import get_user_model
from django.contrib.auth.signals import user_logged_in
from django.db.models.signals import post_migrate, post_save
from django.dispatch import receiver

from apps.core.models import AuditLog, Company
from shared_kernel.audit import log_action

from .models import Role
from .services import AccountService
from .tasks import send_welcome_email

User = get_user_model()


@receiver(post_save, sender=Company)
def company_post_save(sender, instance, created, **kwargs):
    if created:
        AccountService.ensure_default_roles(instance)


@receiver(post_migrate)
def accounts_post_migrate(sender, **kwargs):
    if getattr(sender, "label", None) != "accounts":
        return
    try:
        for company in Company.objects.all().only("id"):
            AccountService.ensure_default_roles(company)
    except Exception:
        pass


@receiver(post_save, sender=User)
def user_post_save(sender, instance, created, **kwargs):
    if created:
        if not getattr(instance, "role_id", None) and getattr(instance, "company_id", None):
            role = Role.all_objects.filter(company_id=instance.company_id, name="Membro").only("id").first()
            if role:
                instance.role_id = role.id
                instance.save(update_fields=["role"])

        # 1. Audit Log
        # Note: We don't have request.user here easily for 'user' field in AuditLog unless we use thread locals.
        # For now, we leave user=None or system.
        AuditLog.objects.create(
            company=instance.company,
            action="create",
            resource="User",
            resource_id=str(instance.id),
            details={"username": instance.username, "email": instance.email},
        )

        # 2. Async Task: Welcome Email
        # Use on_commit to ensure DB transaction is finished before Celery worker tries to read the user
        from django.db import transaction

        def _safe_send():
            try:
                send_welcome_email.delay(instance.id, instance.username, instance.email)
            except Exception:
                # Ignore broker connection errors in dev/test environments
                pass

        transaction.on_commit(_safe_send)

@receiver(user_logged_in)
def user_logged_in_audit_log(sender, request, user, **kwargs):
    if request:
        user_agent = request.META.get("HTTP_USER_AGENT", "<unknown>")
        log_action(
            user=user,
            action="login",
            resource="User",
            resource_id=str(user.id),
            details={"user_agent": user_agent},
            request=request
        )
