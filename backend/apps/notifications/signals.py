from urllib.parse import quote

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.articles.models import Article
from apps.messenger.models import Message

from .models import Notification
from .tasks import send_websocket_notification


@receiver(post_save, sender=Message)
def notify_new_message(sender, instance, created, **kwargs):
    if created:
        conversation = instance.conversation

        # Notify all participants except the sender
        for participant in conversation.participants.exclude(id=instance.sender.id):
            # Create notification record
            # I-N3: encode created_at para evitar quebra de URL ('+' em iso format)
            created_at_encoded = quote(instance.created_at.isoformat())
            notification = Notification.objects.create(
                company=instance.company,
                recipient=participant,
                notification_type=Notification.TYPE_MESSAGE,
                title=f"Nova mensagem de {instance.sender.username}",
                message=instance.content[:100] if instance.content else "Anexo enviado",
                link=f"/messenger?conversation={conversation.id}&message_id={instance.id}&created_at={created_at_encoded}",
            )

            from django.db import transaction

            # Send to WebSocket via Celery
            transaction.on_commit(lambda p=participant, n=notification: send_websocket_notification.delay(
                f"notifications_user_{p.id}",
                {
                    "type": "notification_message",
                    "notification_id": str(n.id),
                    "notification_type": n.notification_type,
                    "title": n.title,
                    "message": n.message,
                    "link": n.link,
                    "conversation_id": conversation.id,
                    "message_id": instance.id,
                    "message_created_at": instance.created_at.isoformat(),
                    "created_at": n.created_at.isoformat(),
                },
            ))


@receiver(pre_save, sender=Article)
def track_article_status(sender, instance, **kwargs):
    """
    Salva o status original diretamente na instância para comparação no post_save.
    Evita o uso de dicionários globais que não são seguros em ambientes multi-worker.
    """
    if instance.pk:
        try:
            # Busca apenas o campo status para performance
            previous = Article.objects.filter(pk=instance.pk).values("status").first()
            instance._original_status = previous["status"] if previous else None
        except Exception:
            instance._original_status = None
    else:
        instance._original_status = None


@receiver(post_save, sender=Article)
def notify_article_status(sender, instance, created, **kwargs):
    """
    Notifica o autor apenas quando o status MUDA para 'published'.
    """
    if created:
        return

    original_status = getattr(instance, "_original_status", None)

    if instance.status == Article.STATUS_PENDING and original_status != Article.STATUS_PENDING:
        User = get_user_model()
        perm = "articles.article_publish"
        candidates = (
            User.all_objects.filter(company=instance.company, is_active=True)
            .select_related("role", "notification_preference")
            .filter(Q(is_superuser=True) | Q(is_staff=True) | Q(role__isnull=False))
        )
        recipients = []
        for u in candidates:
            pref = getattr(u, "notification_preference", None)
            if pref and getattr(pref, "notify_moderation_article_pending", True) is False:
                continue
            if u.is_superuser or u.is_staff:
                recipients.append(u)
                continue
            role = getattr(u, "role", None)
            perms = getattr(role, "permissions", None) if role else None
            if isinstance(perms, list) and perm in perms:
                recipients.append(u)
        if getattr(instance, "author_id", None):
            recipients = [u for u in recipients if u.id != instance.author_id]

        title = "Novo artigo pendente"
        link = "/artigos?tab=moderation"
        msg = f"{instance.title}: aguardando aprovação."
        for u in recipients:
            aggregate_key = f"articles.moderation.pending:{instance.id}:a"
            notification = (
                Notification.objects.filter(
                    company=instance.company,
                    recipient=u,
                    is_read=False,
                    notification_type=Notification.TYPE_APPROVAL,
                    title=title,
                    aggregate_key=aggregate_key,
                )
                .order_by("-created_at")
                .first()
            )

            count = 1
            if notification:
                count = int(getattr(notification, "aggregate_count", 1) or 1) + 1

            final_message = msg if count <= 1 else f"{count} artigos pendentes. Último: {instance.title}"

            if notification:
                notification.message = final_message
                notification.link = link
                notification.is_read = False
                notification.aggregate_count = count
                notification.metadata = {
                    "kind": "article_moderation_pending",
                    "article_id": str(instance.id),
                    "article_slug": instance.slug,
                    "last_title": instance.title,
                }
                notification.save(update_fields=["message", "link", "is_read", "aggregate_count", "metadata"])
            else:
                notification = Notification.objects.create(
                    company=instance.company,
                    recipient=u,
                    notification_type=Notification.TYPE_APPROVAL,
                    title=title,
                    message=final_message,
                    link=link,
                    aggregate_key=aggregate_key,
                    aggregate_count=count,
                    metadata={
                        "kind": "article_moderation_pending",
                        "article_id": str(instance.id),
                        "article_slug": instance.slug,
                        "last_title": instance.title,
                    },
                )

            try:
                send_websocket_notification.delay(
                    f"notifications_user_{u.id}",
                    {
                        "type": "notification_message",
                        "notification_id": str(notification.id),
                        "notification_type": notification.notification_type,
                        "title": notification.title,
                        "message": notification.message,
                        "link": notification.link,
                        "created_at": notification.created_at.isoformat(),
                    },
                )
            except Exception:
                pass

    # Só notifica se houve transição real para 'published'
    if instance.status == Article.STATUS_PUBLISHED and original_status != Article.STATUS_PUBLISHED:
        if instance.author:
            notification = Notification.objects.create(
                company=instance.company,
                recipient=instance.author,
                notification_type=Notification.TYPE_APPROVAL,
                title="Artigo Publicado!",
                message=f"Seu artigo '{instance.title}' foi publicado com sucesso.",
                link=f"/p/artigos/{instance.slug}",
            )

            send_websocket_notification.delay(
                f"notifications_user_{instance.author.id}",
                {
                    "type": "notification_message",
                    "notification_id": str(notification.id),
                    "notification_type": notification.notification_type,
                    "title": notification.title,
                    "message": notification.message,
                    "link": notification.link,
                    "created_at": notification.created_at.isoformat(),
                },
            )
