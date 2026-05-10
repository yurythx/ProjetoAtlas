import logging
import requests
from celery import shared_task
from django.apps import apps
from django.db.models import F, Q
from django.utils import timezone
from shared_kernel.sanitization import sanitize_url

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=5)
def async_send_column_change_webhook(self, webhook_url, payload, deal_id, company_id):
    """
    Envia o webhook de integração (n8n/GLPI) de forma assíncrona.
    """
    safe_url = sanitize_url(webhook_url, allowed_protocols=["http", "https"])
    if not safe_url:
        logger.error(f"Invalid webhook URL for deal {deal_id}: {webhook_url}")
        return "invalid_url"

    try:
        response = requests.post(safe_url, json=payload, timeout=15)
        response.raise_for_status()
        return f"Webhook sent to {safe_url}"
    except requests.RequestException as e:
        logger.warning(
            f"Failed to send webhook to {safe_url} (Attempt {self.request.retries + 1}): {e}"
        )
        # Tenta novamente em 1, 2, 4, 8, 16 minutos
        raise self.retry(exc=e, countdown=2**self.request.retries * 60)

@shared_task(bind=True, max_retries=5)
def send_xla_whatsapp_poll(self, deal_id):
    """
    Envia uma enquete de satisfação (XLA) via WhatsApp quando um card é fechado.
    """
    from django.conf import settings
    Deal = apps.get_model("crm", "Deal")
    EvolutionConfig = apps.get_model("crm", "EvolutionConfig")
    from .integrations import EvolutionClient

    try:
        deal = Deal.all_objects.select_related("contact", "company").get(id=deal_id)
        if not deal.contact or not deal.contact.phone:
            return "no_phone"

        config = EvolutionConfig.objects.filter(company=deal.company, is_active=True).first()
        if not config:
            return "no_whatsapp_config"

        client = EvolutionClient(config)
        poll_name = f"Como foi sua experiência com: {deal.title}?"
        options = [
            "Excelente (Superou Expectativas)",
            "Bom (Atendeu as Necessidades)",
            "Regular (Poderia ser Melhor)",
            "Ruim (Não resolveu meu problema)"
        ]
        
        client.send_poll(deal.contact.phone, poll_name, options)
        return f"XLA Poll sent for deal {deal_id}"
        
    except Exception as e:
        logger.warning(f"Failed to send XLA poll for deal {deal_id} (Attempt {self.request.retries + 1}): {e}")
        raise self.retry(exc=e, countdown=60 * (2**self.request.retries))

@shared_task(bind=True, max_retries=5)
def orchestrate_swarming(self, deal_id):
    """
    Inicia a orquestração de Swarming para incidentes críticos (ITIL v5).
    """
    from django.conf import settings
    Deal = apps.get_model("crm", "Deal")
    Swarm = apps.get_model("crm", "Swarm")
    EvolutionConfig = apps.get_model("crm", "EvolutionConfig")
    from django.contrib.auth import get_user_model
    User = get_user_model()
    from .integrations import EvolutionClient

    try:
        deal = Deal.all_objects.select_related("company").get(id=deal_id)
        
        # 1. Cria ou recupera a sessão de Swarm
        swarm, created = Swarm.objects.get_or_create(
            deal=deal,
            company=deal.company,
            defaults={"is_active": True}
        )
        
        if not created and not swarm.is_active:
            swarm.is_active = True
            swarm.started_at = timezone.now()
            swarm.save()

        # 2. Notifica a equipe técnica via WhatsApp
        config = EvolutionConfig.objects.filter(company=deal.company, is_active=True).first()
        if config:
            client = EvolutionClient(config)
            technicians = User.objects.filter(company=deal.company, phone__isnull=False).exclude(phone="")
            
            frontend_url = getattr(settings, "FRONTEND_URL", "https://atlas.crm.com")
            alert_msg = (
                f"🚨 *ALERTA DE SWARMING (ITIL v5)* 🚨\n\n"
                f"Incidente crítico: *{deal.title}*\n"
                f"Prioridade: CRÍTICA\n"
                f"Ação: Requer colaboração imediata.\n\n"
                f"🔗 *Link do Card:* {frontend_url}/crm?dealId={deal.id}"
            )
            
            for tech in technicians:
                client.send_text(tech.phone, alert_msg)
        
        return f"Swarming orchestrated for deal {deal_id}"
        
    except Exception as e:
        logger.warning(f"Failed to orchestrate swarming for {deal_id} (Attempt {self.request.retries + 1}): {e}")
        raise self.retry(exc=e, countdown=60 * (2**self.request.retries))


@shared_task
def check_integrations_health(company_id):
    """
    Heartbeat de Observabilidade: Verifica se os sistemas externos estão online.
    """
    EvolutionConfig = apps.get_model("crm", "EvolutionConfig")
    configs = EvolutionConfig.objects.filter(company_id=company_id, is_active=True)
    
    results = []
    for config in configs:
        try:
            # Simples HEAD request para testar conectividade
            response = requests.head(config.api_url, timeout=5)
            status = "online" if response.status_code < 500 else "degraded"
            results.append({"instance": config.instance_name, "status": status})
        except:
            results.append({"instance": config.instance_name, "status": "offline"})
            
    # Aqui poderíamos disparar uma notificação caso algo esteja offline
    return results


@shared_task(bind=True, soft_time_limit=60, time_limit=90)
def run_automation_rules(self, deal_id: int, trigger: str):
    """
    Evaluate and execute all active AutomationRules for a deal + trigger event.
    Called asynchronously via on_commit from signals.
    """
    Deal = apps.get_model("crm", "Deal")
    AutomationRule = apps.get_model("crm", "AutomationRule")
    Notification = apps.get_model("notifications", "Notification")

    try:
        deal = Deal.objects.select_related("company", "assigned_to", "owner").get(id=deal_id)
    except Deal.DoesNotExist:
        return f"deal {deal_id} not found"

    pipeline_id = deal.column.pipeline_id if deal.column_id else None
    rules = AutomationRule.objects.filter(
        company=deal.company,
        trigger=trigger,
        is_active=True,
    ).filter(
        Q(pipeline__isnull=True) | Q(pipeline_id=pipeline_id)
    )

    executed = 0
    for rule in rules:
        if not rule.matches(deal):
            continue
        try:
            _execute_action(rule, deal, Notification)
            AutomationRule.objects.filter(pk=rule.pk).update(
                execution_count=F("execution_count") + 1,
                last_triggered_at=timezone.now(),
            )
            executed += 1
        except Exception:
            logger.exception("automation_rule_failed rule_id=%s deal_id=%s", rule.pk, deal_id)

    return f"automation: {executed} rules executed for deal {deal_id} trigger={trigger}"


def _execute_action(rule, deal, Notification):
    """Dispatch the configured action for a matching rule."""
    from shared_kernel.sanitization import sanitize_url

    action = rule.action
    cfg = rule.action_config or {}

    if action == "notify_assignee":
        recipient = deal.assigned_to or deal.owner
        if not recipient:
            return
        Notification.objects.create(
            recipient=recipient,
            company=deal.company,
            title=f"Automação: {rule.name}",
            message=f"Regra ativada para o card '{deal.title}' (gatilho: {rule.get_trigger_display()}).",
            notification_type="system",
            metadata={"deal_id": deal.id, "rule_id": rule.id},
        )

    elif action == "create_notification":
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_id = cfg.get("user_id")
        if not user_id:
            return
        try:
            user = User.objects.get(id=user_id, company=deal.company)
        except User.DoesNotExist:
            return
        Notification.objects.create(
            recipient=user,
            company=deal.company,
            title=cfg.get("title", f"Automação: {rule.name}"),
            message=cfg.get("message", f"Card '{deal.title}' ativou a regra '{rule.name}'."),
            notification_type="system",
            metadata={"deal_id": deal.id, "rule_id": rule.id},
        )

    elif action == "assign_user":
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_id = cfg.get("user_id")
        if not user_id:
            return
        try:
            user = User.objects.get(id=user_id, company=deal.company)
        except User.DoesNotExist:
            return
        deal.__class__.objects.filter(pk=deal.pk).update(assigned_to=user)

    elif action == "send_webhook":
        url = sanitize_url(cfg.get("url", ""), allowed_protocols=["http", "https"])
        if not url:
            return
        import requests
        payload = {
            "event": rule.trigger,
            "rule": rule.name,
            "deal": {"id": deal.id, "title": deal.title, "priority": deal.priority, "record_type": deal.record_type},
        }
        requests.post(url, json=payload, timeout=10)
