import json
import logging

from celery import shared_task
from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, ignore_result=True)
def send_push_notification(self, subscription_id, title, message, link=None, icon=None):
    # S7: Guard — do not attempt push if VAPID keys are not configured.
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning(
            "Push notification skipped: VAPID keys not configured. "
            "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment."
        )
        return "Push skipped: VAPID keys not configured"

    try:
        sub = PushSubscription.objects.get(pk=subscription_id, is_active=True)
    except PushSubscription.DoesNotExist:
        return f"Subscription {subscription_id} not found or inactive"

    subscription_info = {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}}

    data = {"title": title, "body": message, "data": {"url": link or "/"}}
    if icon:
        data["icon"] = icon

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(data),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"},
        )
        return f"Push sent to {sub.user.username}"
    except WebPushException as e:
        logger.exception(f"Push failed for {sub.user.username}")
        # If 410 Gone, the subscription is no longer valid
        if e.response is not None and e.response.status_code == 410:
            sub.is_active = False
            sub.save(update_fields=["is_active"])
            return f"Subscription for {sub.user.username} marked as inactive (410 Gone)"
        # Retry for transient failures (5xx, network errors)
        raise self.retry(exc=e, countdown=60)


@shared_task
def send_websocket_notification(group_name, message_payload):
    """
    Sends a notification message to a WebSocket group using Channels.
    Offloaded to Celery to prevent blocking the main request-response cycle.
    """
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(group_name, message_payload)
    return f"WebSocket notification sent to {group_name}"


def notify_user_push(user, title, message, link=None):
    """
    Utility to send push to all active subscriptions of a user.
    """
    subs = PushSubscription.objects.filter(user=user, is_active=True)
    for sub in subs:
        send_push_notification.delay(sub.id, title, message, link)
