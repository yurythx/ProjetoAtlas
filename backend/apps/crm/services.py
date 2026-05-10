import logging

from apps.module_manager.models import TenantModule

logger = logging.getLogger(__name__)

def user_has_permission(user, permission_slug: str) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    role = getattr(user, "role", None)
    perms = getattr(role, "permissions", None) if role else None
    if not isinstance(perms, list):
        return False
    if "*" in perms:
        return True
    return permission_slug in perms


def get_accessible_pipelines(company, user):
    from django.db.models import Q

    from .models import Pipeline

    if not company:
        return Pipeline.all_objects.none()

    if user_has_permission(user, "admin.settings_manage") or user_has_permission(user, "crm.pipeline_manage"):
        return Pipeline.all_objects.filter(company=company)

    group_ids = []
    if user and getattr(user, "is_authenticated", False):
        if not hasattr(user, "crm_groups"):
            return Pipeline.all_objects.filter(company=company)
        group_ids = list(user.crm_groups.values_list("id", flat=True))

    base = Pipeline.all_objects.filter(company=company)
    if not group_ids:
        return base.filter(visibility="company")
    return base.filter(Q(visibility="company") | Q(visibility="group", groups__in=group_ids)).distinct()


def get_crm_integration_config(company):
    tenant_module = (
        TenantModule.all_objects.select_related("module")
        .filter(company=company, module__code="crm", is_active=True)
        .first()
    )
    return tenant_module.config if tenant_module else {}


def send_column_change_webhook(card, previous_column, new_column):
    from .tasks import async_send_column_change_webhook
    
    config = get_crm_integration_config(card.company)
    webhook_url = (
        config.get("integration", {}).get("n8n_webhook_url")
        or config.get("n8n_webhook_url")
    )
    
    if not webhook_url:
        return False

    payload = {
        "card_id": card.id,
        "external_id": card.external_id,
        "new_column_title": new_column.title if new_column else None,
        "tenant_id": str(card.company_id),
        "previous_column_title": previous_column.title if previous_column else None,
        "integration_source": card.integration_source,
    }

    # Dispara a tarefa assíncrona
    async_send_column_change_webhook.delay(
        webhook_url, 
        payload, 
        card.id, 
        str(card.company_id)
    )
    return True
