import logging
import requests
from celery import shared_task
from django.apps import apps
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
