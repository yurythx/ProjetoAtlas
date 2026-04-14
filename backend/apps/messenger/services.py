import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count
from django.utils import timezone

from apps.notifications.tasks import notify_user_push

from .models import ContactBlock, Conversation, ConversationPreference, Message
from .serializers import MessageSerializer

logger = logging.getLogger(__name__)

User = get_user_model()


class MessengerService:
    @staticmethod
    def create_conversation(creator, company, participant_usernames=None, title=None, is_group=False):
        """
        Creates a new conversation or returns an existing one for private chats.
        Ensures that 1:1 conversations are unique per company.
        """
        from django.db import transaction

        if isinstance(participant_usernames, str):
            participant_usernames = [participant_usernames]
        elif not participant_usernames:
            participant_usernames = []

        # Normalize: others = set of unique usernames excluding the creator
        others = {u for u in participant_usernames if u and u != creator.username}

        logger.debug(
            f"[Messenger] Create Conversation: creator={creator.username}, company={company}, others={others}, is_group={is_group}"
        )

        with transaction.atomic():
            if not is_group:
                # 1:1 Chat: Find existing private conversation between EXACTLY these participants
                # (either creator + 1 other, or just creator for self-chat)
                qs = Conversation.all_objects.filter(company=company, is_group=False, participants=creator)

                if others:
                    target_username = next(iter(others))  # only consider first for 1:1
                    try:
                        target_user = User.all_objects.get(company=company, username=target_username)
                        existing = (
                            qs.filter(participants=target_user)
                            .annotate(p_count=Count("participants"))
                            .filter(p_count=2)
                            .first()
                        )
                        if existing:
                            logger.info(
                                f"[Messenger] Found existing 1:1 conversation {existing.id} for {creator.username} and {target_username}"
                            )
                            return existing
                    except User.DoesNotExist:
                        logger.warning(f"[Messenger] Target user {target_username} not found in company {company}")
                        pass
                else:
                    # Self-chat
                    existing = qs.annotate(p_count=Count("participants")).filter(p_count=1).first()
                    if existing:
                        logger.info(f"[Messenger] Found existing self-chat {existing.id} for {creator.username}")
                        return existing

            # If we reached here, create a new one
            logger.info(f"[Messenger] Creating new conversation: title={title}, is_group={is_group}")
            conversation = Conversation.all_objects.create(company=company, title=title, is_group=is_group)

            participants_to_add = [creator]
            if is_group:
                for username in others:
                    try:
                        target_user = User.all_objects.get(company=company, username=username)
                        participants_to_add.append(target_user)
                    except User.DoesNotExist:
                        continue
            elif others:
                # 1:1 case
                target_username = next(iter(others))
                try:
                    target_user = User.all_objects.get(company=company, username=target_username)
                    participants_to_add.append(target_user)
                except User.DoesNotExist:
                    pass

            conversation.participants.set(participants_to_add)
            logger.debug(
                f"[Messenger] Created conversation {conversation.id} with participants {[p.username for p in participants_to_add]}"
            )
            return conversation

    @staticmethod
    @transaction.atomic
    def send_message(
        user, company, conversation, content=None, file_obj=None, request=None, reply_to_id=None, client_id=None
    ):
        """
        Sends a message to a conversation and signals via WebSockets.
        """
        logger.debug(
            f"[Messenger] Sending message: user={user.username}, conversation={conversation.id}, has_file={bool(file_obj)}"
        )

        if not conversation.is_group:
            other = conversation.participants.exclude(id=user.id).only("id").first()
            if other and ContactBlock.all_objects.filter(
                company=company, blocker_id__in=[user.id, other.id], blocked_id__in=[user.id, other.id]
            ).exists():
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied("Não é possível enviar mensagem para este contato.")

        message_data = {
            "company": company,
            "conversation": conversation,
            "sender": user,
            "content": content,
            "client_id": client_id,
        }

        if file_obj:
            message_data["file"] = file_obj
            message_data["file_name"] = file_obj.name
            message_data["file_type"] = getattr(file_obj, "content_type", "application/octet-stream")
            message_data["file_size"] = file_obj.size
            logger.info(f"[Messenger] Attaching file {file_obj.name} ({file_obj.size} bytes)")

        if reply_to_id:
            try:
                reply_to = Message.all_objects.get(id=reply_to_id, conversation=conversation)
                message_data["reply_to"] = reply_to
            except Message.DoesNotExist:
                logger.warning(f"[Messenger] Reply to message {reply_to_id} not found")

        message = Message.objects.create(**message_data)

        if file_obj:
            logger.info(
                f"[Messenger] Message {message.id} created with file path: {message.file.name if message.file else 'NONE'}"
            )
            if message.file:
                logger.debug(f"[Messenger] Generated URL: {message.file.url}")

        # Signaling
        MessengerService.broadcast_message(company, conversation, message, request)

        # Web Push Notification
        # Respect Mute settings: only notify participants who haven't muted this conversation
        # Also exclude the sender (user)
        muted_user_ids = list(ConversationPreference.objects.filter(conversation=conversation, is_muted=True).values_list(
            "user_id", flat=True
        ))

        recipients = list(conversation.participants.exclude(id=user.id).exclude(id__in=muted_user_ids))

        def send_notifications():
            MessengerService.broadcast_message(company, conversation, message, request)
            for participant in recipients:
                notify_user_push(
                    participant,
                    title=f"{user.first_name or user.username}",
                    message=content[:100] if content else "Enviou um arquivo.",
                    link=f"/messenger?conversation={conversation.id}&message_id={message.id}",
                )

        transaction.on_commit(send_notifications)

        return message

    @staticmethod
    def broadcast_message(company, conversation, message, request=None):
        """
        Signals the new message to all participants via WebSocket group.
        """
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"chat_{company.slug}_{conversation.id}"

        # Serialize with context for absolute URLs
        context = {"request": request} if request else {}
        serialized_message = MessageSerializer(message, context=context).data

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "chat_message",
                "message": message.content,
                "sender_id": message.sender.id,
                "sender_username": message.sender.username,
                "message_id": message.id,
                "client_id": str(message.client_id) if message.client_id else None,
                "created_at": message.created_at.isoformat(),
                "file_url": serialized_message.get("file_url"),
                "file_name": serialized_message.get("file_name"),
                "file_type": serialized_message.get("file_type"),
                "file_size": serialized_message.get("file_size"),
                "reply_to": serialized_message.get("reply_to"),
            },
        )

    @staticmethod
    def add_reaction(user, message, emoji):
        from .models import MessageReaction

        reaction, created = MessageReaction.all_objects.get_or_create(
            message=message, user=user, emoji=emoji, defaults={"company": message.company}
        )

        if created:
            MessengerService.broadcast_reaction(message.company, message.conversation, message.id, user, emoji, "add")

        return reaction

    @staticmethod
    def remove_reaction(user, message, emoji):
        from .models import MessageReaction

        try:
            reaction = MessageReaction.objects.get(message=message, user=user, emoji=emoji)
            reaction.delete()
            MessengerService.broadcast_reaction(
                message.company, message.conversation, message.id, user, emoji, "remove"
            )
            return True
        except MessageReaction.DoesNotExist:
            return False

    @staticmethod
    def broadcast_reaction(company, conversation, message_id, user, emoji, action):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"chat_{company.slug}_{conversation.id}"

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "reaction_update",
                "message_id": message_id,
                "user_id": user.id,
                "username": user.username,
                "emoji": emoji,
                "action": action,
            },
        )

    @staticmethod
    def broadcast_read_receipt(company, conversation, message_id, user_id):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"chat_{company.slug}_{conversation.id}"

        async_to_sync(channel_layer.group_send)(
            group_name, {"type": "read_receipt_update", "message_id": message_id, "user_id": user_id, "is_read": True}
        )

    @staticmethod
    def broadcast_delete(company, conversation, message_id):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"chat_{company.slug}_{conversation.id}"

        async_to_sync(channel_layer.group_send)(group_name, {"type": "delete_message", "message_id": message_id})

    @staticmethod
    def broadcast_edit(company, conversation, message):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"chat_{company.slug}_{conversation.id}"

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "edit_message",
                "message_id": message.id,
                "content": message.content,
                "edited_at": message.edited_at.isoformat() if message.edited_at else None,
            },
        )

    @staticmethod
    def broadcast_all_read(company, conversation, user_id):
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        group_name = f"chat_{company.slug}_{conversation.id}"

        async_to_sync(channel_layer.group_send)(
            group_name,
            {
                "type": "read_all_update",
                "conversation_id": conversation.id,
                "user_id": user_id,
                "read_at": timezone.now().isoformat(),
            },
        )
