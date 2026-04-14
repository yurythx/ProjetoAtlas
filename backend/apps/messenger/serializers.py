from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import serializers

from .models import ContactBlock, Conversation, ConversationPreference, Message, MessageReaction

User = get_user_model()


class ContactSerializer(serializers.ModelSerializer):
    is_online = serializers.SerializerMethodField()
    group_names = serializers.SerializerMethodField()
    is_staff = serializers.BooleanField(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    last_seen = serializers.DateTimeField(read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "is_online",
            "group_names",
            "is_staff",
            "avatar_url",
            "last_seen",
            "status",
        ]

    def get_is_online(self, obj):
        """Returns True for both 'online' and 'busy' statuses (#1 fix)."""
        key = f"user_presence:{obj.id}"
        return cache.get(key) in ("online", "busy")

    def get_group_names(self, obj):
        return [g.name for g in obj.groups.all()]

    def get_avatar_url(self, obj):
        if obj.avatar:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.avatar.url)
            return obj.avatar.url
        return None


class MessageReactionSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = MessageReaction
        fields = ["id", "user", "user_username", "emoji", "created_at"]


class SimpleMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)

    class Meta:
        model = Message
        fields = ["id", "content", "sender", "sender_username", "created_at", "file_name", "file_type"]


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    file_url = serializers.SerializerMethodField()
    reactions = MessageReactionSerializer(many=True, read_only=True)
    reply_to = SimpleMessageSerializer(read_only=True)
    is_read = serializers.SerializerMethodField()
    read_by_count = serializers.IntegerField(read_only=True)
    is_delivered = serializers.SerializerMethodField()
    delivered_by_count = serializers.IntegerField(read_only=True)
    # Soft-deleted messages expose content as None via model; we surface a flag for the UI
    is_deleted = serializers.BooleanField(read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "client_id",
            "conversation",
            "sender",
            "sender_username",
            "content",
            "file",
            "file_url",
            "file_name",
            "file_type",
            "file_size",
            "created_at",
            "is_delivered",
            "delivered_by_count",
            "is_read",
            "read_by_count",
            "reactions",
            "reply_to",
            "edited_at",
            "is_deleted",
        ]
        read_only_fields = ["sender", "conversation", "reply_to", "edited_at", "is_deleted"]

    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None

    def get_is_read(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not getattr(user, "is_authenticated", False):
            return bool(getattr(obj, "is_read", False))

        if obj.sender_id == user.id:
            participants_count = self.context.get("participants_count")
            try:
                expected = max(int(participants_count or 0) - 1, 0)
            except Exception:
                expected = 0
            read_by_count = getattr(obj, "read_by_count", None)
            if read_by_count is not None and expected > 0:
                return int(read_by_count) >= expected
            return bool(getattr(obj, "is_read", False))

        read_by_me = getattr(obj, "read_by_me", None)
        if read_by_me is not None:
            return bool(read_by_me)

        from .models import MessageRead

        return MessageRead.objects.filter(message_id=obj.id, user_id=user.id).exists()

    def get_is_delivered(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        if not user or not getattr(user, "is_authenticated", False):
            return True

        if obj.sender_id == user.id:
            participants_count = self.context.get("participants_count")
            try:
                expected = max(int(participants_count or 0) - 1, 0)
            except Exception:
                expected = 0
            delivered_by_count = getattr(obj, "delivered_by_count", None)
            if delivered_by_count is not None and expected > 0:
                return int(delivered_by_count) >= expected
            return True

        delivered_by_me = getattr(obj, "delivered_by_me", None)
        if delivered_by_me is not None:
            return bool(delivered_by_me)

        from .models import MessageDelivery

        return MessageDelivery.objects.filter(message_id=obj.id, user_id=user.id).exists()


class MessageSearchSerializer(MessageSerializer):
    conversation_title = serializers.CharField(source="conversation.title", read_only=True, allow_null=True)
    conversation_is_group = serializers.BooleanField(source="conversation.is_group", read_only=True)
    conversation_participants_list = serializers.SerializerMethodField()

    class Meta(MessageSerializer.Meta):
        fields = [
            *MessageSerializer.Meta.fields,
            "conversation_title",
            "conversation_is_group",
            "conversation_participants_list",
        ]

    def get_conversation_participants_list(self, obj):
        participants = getattr(obj.conversation, "participants", None)
        if participants is None:
            return []
        return [u.username for u in participants.all()]


class ConversationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConversationPreference
        fields = ["is_muted", "is_pinned", "is_deleted", "deleted_at", "cleared_at", "is_archived", "archived_at"]


class ConversationSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    participants_list = serializers.SerializerMethodField()
    # Annotated in the viewset queryset via Count(...), but falls back to 0 if not present
    unread_count = serializers.SerializerMethodField()
    # User-specific preferences (mute / pin)
    preference = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "participants",
            "participants_list",
            "created_at",
            "updated_at",
            "title",
            "is_group",
            "last_message",
            "unread_count",
            "preference",
        ]
        read_only_fields = ["participants"]

    def get_last_message(self, obj):
        request = self.context.get("request")
        cleared_at = None
        if request:
            prefetched = getattr(obj, "prefetched_pref", None)
            if prefetched is not None:
                pref = prefetched[0] if prefetched else None
            else:
                pref = None
            if pref is None:
                try:
                    pref = ConversationPreference.objects.get(user=request.user, conversation=obj)
                except ConversationPreference.DoesNotExist:
                    pref = None
            cleared_at = getattr(pref, "cleared_at", None) if pref else None

        # 1. Try to use annotated fields from Subqueries (optimized path #26)
        last_id = getattr(obj, "last_msg_id", None)
        if last_id:
            last_created_at = getattr(obj, "last_msg_created_at", None)
            if cleared_at and last_created_at and last_created_at <= cleared_at:
                return None
            return {
                "id": last_id,
                "content": getattr(obj, "last_msg_content", ""),
                "sender": getattr(obj, "last_msg_sender_id", None),
                "sender_username": getattr(obj, "last_msg_sender_username", ""),
                "created_at": last_created_at,
                "file_name": getattr(obj, "last_msg_file_name", None),
                "file_type": getattr(obj, "last_msg_file_type", None),
            }

        # 2. Fallback to prefetched_last (older logic, kept for backward compatibility)
        prefetched = getattr(obj, "prefetched_last", None)
        if prefetched is not None:
            last_msg = prefetched[0] if prefetched else None
            if last_msg:
                return SimpleMessageSerializer(last_msg).data

        # 3. Last fallback: Direct query (worst case)
        msg_qs = obj.messages
        if cleared_at:
            msg_qs = msg_qs.filter(created_at__gt=cleared_at)
        last_msg = msg_qs.order_by("-created_at").first()
        if last_msg:
            return SimpleMessageSerializer(last_msg).data
        return None

    def get_participants_list(self, obj):
        return [user.username for user in obj.participants.all()]

    def get_unread_count(self, obj):
        # Check if it was annotated in the queryset
        count = getattr(obj, "unread_count", None)
        if count is not None and not callable(count):
            return count
        return 0

    def get_preference(self, obj):
        request = self.context.get("request")
        if not request:
            return {"is_muted": False, "is_pinned": False}
        # Use prefetched pref list set in the viewset to avoid N+1 (#3 fix)
        prefetched = getattr(obj, "prefetched_pref", None)
        if prefetched is not None:
            pref = prefetched[0] if prefetched else None
        else:
            pref = getattr(obj, "_user_preference", None)
            if pref is None:
                try:
                    pref = ConversationPreference.objects.get(user=request.user, conversation=obj)
                except ConversationPreference.DoesNotExist:
                    pref = None
        if pref is None:
            return {"is_muted": False, "is_pinned": False}
        return ConversationPreferenceSerializer(pref).data


class ContactBlockSerializer(serializers.ModelSerializer):
    blocker_username = serializers.CharField(source="blocker.username", read_only=True)
    blocked_username = serializers.CharField(source="blocked.username", read_only=True)

    class Meta:
        model = ContactBlock
        fields = ["id", "blocker", "blocker_username", "blocked", "blocked_username", "created_at"]
        read_only_fields = ["blocker", "created_at"]

    def validate_blocked(self, value):
        if value == self.context["request"].user:
            raise serializers.ValidationError("Você não pode bloquear a si mesmo.")
        return value

    def create(self, validated_data):
        validated_data["blocker"] = self.context["request"].user
        return super().create(validated_data)
