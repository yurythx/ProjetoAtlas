import json
import logging
import time

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.cache import cache

from shared_kernel.tenant_context import set_current_company

from .models import Conversation, Message, MessageDelivery, MessageRead

logger = logging.getLogger(__name__)


class PresenceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        self.company_slug = await self.get_company_slug()
        self.room_group_name = f"presence_{self.company_slug}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()

        # Mark presence with current user status and broadcast
        user_status = await self.get_user_status()
        await self.update_presence(user_status)
        await self.broadcast_status(user_status)

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.update_presence("offline")
            await self.broadcast_status("offline")

            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def presence_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def receive(self, text_data):
        try:
            # Atomic Rate limiting: max 5 status updates/second
            rate_key = f"ws:presence:rl:{self.user.id}"
            if cache.add(rate_key, 1, timeout=1):
                count = 1
            else:
                try:
                    count = cache.incr(rate_key)
                except ValueError:
                    count = 1

            if count > 5:
                # Do not close connection for presence (silent ignore is better for UI)
                return

            data = json.loads(text_data)

            msg_type = data.get("type")
            if msg_type == "set_status" or msg_type == "heartbeat":
                new_status = data.get("status")
                if not new_status and msg_type == "heartbeat":
                    # If heartbeat without explicit status, refresh current
                    new_status = await self.get_user_status()

                if new_status in ["online", "busy", "offline"]:
                    await self.update_presence(new_status)
                    if msg_type == "set_status":
                        await self.broadcast_status(new_status)
        except Exception:
            logger.exception("Error in PresenceConsumer.receive", extra={"user_id": getattr(self.user, "id", None)})

    async def broadcast_status(self, status):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "presence_update", "user_id": self.user.id, "username": self.user.username, "status": status},
            )

    @database_sync_to_async
    def get_company_slug(self):
        if hasattr(self.user, "company") and self.user.company:
            return self.user.company.slug
        return "default"

    @database_sync_to_async
    def get_user_status(self):
        """Refresh user from DB to get latest status. Safe fallback if all_objects unavailable (#4 fix)."""
        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            manager = getattr(User, "all_objects", User.objects)
            user = manager.get(pk=self.user.pk)
            return user.status
        except User.DoesNotExist:
            return "online"
        except Exception:
            return "online"

    @database_sync_to_async
    def update_presence(self, status):
        from django.utils import timezone

        set_current_company(self.user.company)
        key = f"user_presence:{self.user.id}"

        # Persist status to database
        type(self.user).objects.filter(pk=self.user.pk).update(status=status)

        if status != "offline":
            # Best Practice: Use TTL (60s) for presence to handle "dirty" disconnects
            cache.set(key, status, timeout=60)
        else:
            cache.delete(key)
            # Persist last_seen so contacts can see "Last seen at HH:MM"
            type(self.user).objects.filter(pk=self.user.pk).update(last_seen=timezone.now())


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope.get("user")

        if not self.user or not self.user.is_authenticated:
            await self.close()
            return

        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        # Verify conversation membership and tenant isolation
        self.conversation = await self.get_conversation(self.conversation_id, self.user)

        if not self.conversation:
            await self.close()
            return

        set_current_company(self.conversation.company)

        company_slug = await self.get_company_slug(self.conversation)
        self.company_slug = company_slug
        self.room_group_name = f"chat_{company_slug}_{self.conversation_id}"

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)

        await self.accept()
        self._rl_window_start = time.monotonic()
        self._rl_count = 0

    async def disconnect(self, close_code):
        if hasattr(self, "room_group_name"):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        """
        Handles incoming WebSocket frames from the client.

        Supported types:
          - "typing_status": broadcasts typing indicator to conversation group.

        NOTE: Message sending is intentionally done via HTTP POST (REST API), not
        via WebSocket, to ensure proper persistence, validation and file upload
        support. Any attempt to send a message payload here will be rejected.
        """
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            await self.close(code=4000)
            return

        message_type = data.get("type")

        now = time.monotonic()
        window_start = getattr(self, "_rl_window_start", now)
        count = getattr(self, "_rl_count", 0)
        if now - window_start >= 1:
            window_start = now
            count = 0
        count += 1
        self._rl_window_start = window_start
        self._rl_count = count
        if count > 15:
            await self.close(code=4008)
            return

        # ── Atomic Rate limiting: max 10 WS frames/second per user ──────────────
        # Best Practice: Use Redis INCR for atomic counting.
        # Use cache.add to initialize and cache.incr to increment atomically.
        company_slug = getattr(self, "company_slug", "default")
        rate_key = f"ws:rl:{company_slug}:{self.user.id}:{self.conversation_id}"

        if cache.add(rate_key, 1, timeout=1):
            count = 1
        else:
            try:
                count = cache.incr(rate_key)
            except ValueError:
                # Fallback for some backends that might still race
                cache.set(rate_key, 1, timeout=1)
                count = 1

        if count > 10:
            await self.close(code=4008)  # 4008: rate limit exceeded
            return
        # ───────────────────────────────────────────────────────────────────────

        if message_type == "typing_status":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "typing_status",
                    "user_id": self.user.id,
                    "username": self.user.username,
                    "is_typing": bool(data.get("is_typing", False)),
                },
            )
        elif message_type == "mark_read":
            message_ids = data.get("message_ids") or []
            if not isinstance(message_ids, list) or not all(isinstance(x, int) for x in message_ids):
                await self.close(code=4000)
                return

            updated_ids = await self.mark_messages_read(message_ids)
            for mid in updated_ids:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "read_receipt_update", "message_id": mid, "user_id": self.user.id, "is_read": True},
                )
            if updated_ids:
                await self.send(text_data=json.dumps({"type": "message_read", "message_ids": updated_ids}))
        elif message_type == "delivered":
            message_ids = data.get("message_ids") or []
            if not isinstance(message_ids, list) or not all(isinstance(x, int) for x in message_ids):
                await self.close(code=4000)
                return

            updated_ids = await self.mark_messages_delivered(message_ids)
            for mid in updated_ids:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "delivery_receipt_update",
                        "message_id": mid,
                        "user_id": self.user.id,
                        "is_delivered": True,
                    },
                )
            if updated_ids:
                await self.send(text_data=json.dumps({"type": "message_delivered", "message_ids": updated_ids}))
        else:
            # Unknown or unsupported type — silently ignore.
            # Messages MUST be sent via the REST API endpoint.
            pass

    # ──────────────────────────────────────────────────────────
    # Group event handlers (called by channel layer group_send)
    # ──────────────────────────────────────────────────────────

    async def chat_message(self, event):
        """New message broadcast from the REST API via MessengerService.broadcast_message."""
        await self.send(
            text_data=json.dumps(
                {
                    "type": "message",
                    "message": event["message"],
                    "sender_id": event["sender_id"],
                    "sender_username": event["sender_username"],
                    "message_id": event["message_id"],
                    "client_id": event.get("client_id"),
                    "created_at": event["created_at"],
                    "file_url": event.get("file_url"),
                    "file_name": event.get("file_name"),
                    "file_type": event.get("file_type"),
                    "file_size": event.get("file_size"),
                    "reply_to": event.get("reply_to"),
                }
            )
        )

    async def typing_status(self, event):
        """Forward typing status to all group members, excluding the typer."""
        if event["user_id"] != self.user.id:
            await self.send(
                text_data=json.dumps(
                    {
                        "type": "typing",
                        "user_id": event["user_id"],
                        "username": event["username"],
                        "is_typing": event["is_typing"],
                    }
                )
            )

    async def reaction_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "reaction",
                    "message_id": event["message_id"],
                    "user_id": event["user_id"],
                    "username": event["username"],
                    "emoji": event["emoji"],
                    "action": event["action"],
                }
            )
        )

    async def read_receipt_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "read_receipt",
                    "message_id": event["message_id"],
                    "user_id": event["user_id"],
                    "is_read": event["is_read"],
                }
            )
        )

    async def delivery_receipt_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "delivery_receipt",
                    "message_id": event["message_id"],
                    "user_id": event["user_id"],
                    "is_delivered": event["is_delivered"],
                }
            )
        )

    async def delete_message(self, event):
        await self.send(text_data=json.dumps({"type": "delete_message", "message_id": event["message_id"]}))

    async def edit_message(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "edit_message",
                    "message_id": event["message_id"],
                    "content": event["content"],
                    "edited_at": event["edited_at"],
                }
            )
        )

    async def read_all_update(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "read_all",
                    "conversation_id": event.get("conversation_id"),
                    "user_id": event.get("user_id"),
                    "read_at": event.get("read_at"),
                }
            )
        )

    # ──────────────────────────────────────────────────────────
    # DB helpers
    # ──────────────────────────────────────────────────────────

    @database_sync_to_async
    def get_conversation(self, conversation_id, user):
        try:
            return Conversation.all_objects.select_related("company").get(id=int(conversation_id), participants=user)
        except (Conversation.DoesNotExist, ValueError):
            return None

    @database_sync_to_async
    def get_company_slug(self, conversation):
        return conversation.company.slug

    @database_sync_to_async
    def mark_messages_read(self, message_ids):
        qs = (
            Message.all_objects.filter(
                company=self.conversation.company, conversation=self.conversation, id__in=message_ids
            )
            .exclude(sender_id=self.user.id)
            .filter(is_deleted=False)
        )
        ids = list(qs.values_list("id", flat=True))
        if not ids:
            return []

        existing = set(
            MessageRead.objects.filter(
                company=self.conversation.company, message_id__in=ids, user_id=self.user.id
            ).values_list("message_id", flat=True)
        )
        new_ids = [mid for mid in ids if mid not in existing]
        if new_ids:
            MessageRead.objects.bulk_create(
                [
                    MessageRead(company=self.conversation.company, message_id=mid, user_id=self.user.id)
                    for mid in new_ids
                ],
                ignore_conflicts=True,
            )

        if not self.conversation.is_group and ids:
            Message.objects.filter(company=self.conversation.company, id__in=ids).update(is_read=True)

        return new_ids

    @database_sync_to_async
    def mark_messages_delivered(self, message_ids):
        qs = (
            Message.all_objects.filter(
                company=self.conversation.company, conversation=self.conversation, id__in=message_ids
            )
            .exclude(sender_id=self.user.id)
            .filter(is_deleted=False)
        )
        ids = list(qs.values_list("id", flat=True))
        if not ids:
            return []

        existing = set(
            MessageDelivery.objects.filter(
                company=self.conversation.company, message_id__in=ids, user_id=self.user.id
            ).values_list("message_id", flat=True)
        )
        new_ids = [mid for mid in ids if mid not in existing]
        if new_ids:
            MessageDelivery.objects.bulk_create(
                [
                    MessageDelivery(company=self.conversation.company, message_id=mid, user_id=self.user.id)
                    for mid in new_ids
                ],
                ignore_conflicts=True,
            )

        return new_ids
