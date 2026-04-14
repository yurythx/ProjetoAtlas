import hashlib
import hmac
import ipaddress
import json
import logging
import time
from urllib.parse import urlparse

import requests
from celery import shared_task

from shared_kernel.sanitization import sanitize_url

from .models import WebhookSubscription

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def dispatch_webhook(self, subscription_id, event_name, payload):
    try:
        sub = WebhookSubscription.all_objects.get(pk=subscription_id, is_active=True)
    except WebhookSubscription.DoesNotExist:
        return f"Subscription {subscription_id} not found or inactive"

    try:
        body = json.dumps({"event": event_name, "timestamp": time.time(), "payload": payload})

        # Gerar assinatura HMAC-SHA256
        signature = hmac.new(sub.secret.encode("utf-8"), msg=body.encode("utf-8"), digestmod=hashlib.sha256).hexdigest()

        headers = {
            "Content-Type": "application/json",
            "X-Atlas-Signature": signature,
            "X-Atlas-Event": event_name,
            "User-Agent": "Atlas-Webhooks/1.0",
        }

        # SSRF protection: validate URL and block private/loopback
        safe_url = sanitize_url(sub.url, allowed_protocols=["http", "https"])
        if not safe_url:
            return "Invalid webhook URL"
        parsed = urlparse(safe_url)
        host = parsed.hostname or ""
        if host in ("localhost", "127.0.0.1"):
            return "Webhook URL host not allowed"
        try:
            ip = ipaddress.ip_address(host) if host.replace(".", "").isdigit() else None
            if ip and (ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local):
                return "Webhook URL IP not allowed"
        except ValueError:
            pass

        response = requests.post(safe_url, data=body, headers=headers, timeout=10, allow_redirects=True)

        # Log delivery attempt
        from .models import WebhookDelivery
        WebhookDelivery.objects.create(
            company=sub.company,
            subscription=sub,
            event_name=event_name,
            status_code=response.status_code,
            success=200 <= response.status_code < 300,
            request_payload=payload,
            response_body=response.text[:2000], # Limita o log a 2000 caracteres
            attempt_number=self.request.retries + 1
        )

        # Validate final URL after redirects
        final_url = response.url or safe_url
        final_parsed = urlparse(final_url)
        final_host = final_parsed.hostname or ""
        if final_host in ("localhost", "127.0.0.1"):
            return "Webhook final URL host not allowed"
        try:
            fip = ipaddress.ip_address(final_host) if final_host.replace(".", "").isdigit() else None
            if fip and (fip.is_private or fip.is_loopback or fip.is_reserved or fip.is_link_local):
                return "Webhook final URL IP not allowed"
        except ValueError:
            pass

        response.raise_for_status()
        return f"Webhook sent to {safe_url} for event {event_name}"

    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending webhook to {sub.url}: {e}")
        # Log falha total (ex: timeout, dns não resolvido)
        from .models import WebhookDelivery
        WebhookDelivery.objects.create(
            company=sub.company,
            subscription=sub,
            event_name=event_name,
            status_code=None,
            success=False,
            request_payload=payload,
            response_body=str(e)[:2000],
            attempt_number=self.request.retries + 1
        )
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=2**self.request.retries * 60)


def trigger_webhooks(company, event_name, payload):
    """
    Função utilitária para ser chamada em signals ou views.
    Encontra assinaturas ativas para o evento e empresa e dispara o Celery.
    """
    # Verifica se o módulo de webhooks está ativo para a empresa
    from apps.module_manager.models import TenantModule
    if not TenantModule.objects.filter(company=company, module__code="webhooks", is_active=True).exists():
        return

    qs = WebhookSubscription.objects.filter(company=company, is_active=True)
    for sub in qs:
        if event_name in (sub.events or []):
            dispatch_webhook.delay(sub.id, event_name, payload)
