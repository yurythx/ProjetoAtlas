from rest_framework import serializers

from .models import Notification, PushSubscription


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "link",
            "aggregate_key",
            "aggregate_count",
            "metadata",
            "is_read",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ["id", "endpoint", "p256dh", "auth", "browser", "device", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]
