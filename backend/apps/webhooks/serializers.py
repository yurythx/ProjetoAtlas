from ipaddress import ip_address
from urllib.parse import urlparse

from django.conf import settings
from rest_framework import serializers

from shared_kernel.sanitization import sanitize_url

from .models import WebhookEvent, WebhookSubscription


class WebhookSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookSubscription
        fields = ["id", "url", "secret", "is_active", "events", "description", "created_at"]
        read_only_fields = ["id", "secret", "created_at"]

    def validate_url(self, value: str):
        sanitized = sanitize_url(value, allowed_protocols=["http", "https"])
        if not sanitized:
            raise serializers.ValidationError("URL inválida.")

        parsed = urlparse(sanitized)
        host = (parsed.hostname or "").strip().lower()
        if not host:
            raise serializers.ValidationError("URL inválida.")
        if host in {"localhost"}:
            raise serializers.ValidationError("Host não permitido.")
        allow_private = bool(getattr(settings, "WEBHOOKS_ALLOW_PRIVATE_ENDPOINTS", False) or getattr(settings, "DEBUG", False))
        try:
            ip = ip_address(host)
            if not allow_private and (ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved or ip.is_multicast):
                raise serializers.ValidationError("Host não permitido.")
        except ValueError:
            pass

        return sanitized

    def validate_events(self, value):
        valid_events = WebhookEvent.values
        for event in value:
            if event not in valid_events:
                raise serializers.ValidationError(f"Evento inválido: {event}")
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        if not request or request.method != "POST":
            data.pop("secret", None)
        return data
