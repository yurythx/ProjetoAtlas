from django.conf import settings
from django.db import models

from shared_kernel.models import BaseTenantModel


class Notification(BaseTenantModel):
    TYPE_MESSAGE = "message"
    TYPE_SYSTEM = "system"
    TYPE_APPROVAL = "approval"

    TYPE_CHOICES = [
        (TYPE_MESSAGE, "Mensagem"),
        (TYPE_SYSTEM, "Sistema"),
        (TYPE_APPROVAL, "Aprovação"),
    ]

    PRIORITY_LOW = "low"
    PRIORITY_MEDIUM = "medium"
    PRIORITY_HIGH = "high"
    PRIORITY_URGENT = "urgent"

    PRIORITY_CHOICES = [
        (PRIORITY_LOW, "Baixa"),
        (PRIORITY_MEDIUM, "Média"),
        (PRIORITY_HIGH, "Alta"),
        (PRIORITY_URGENT, "Urgente"),
    ]

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_SYSTEM)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    module = models.CharField(max_length=50, blank=True, null=True, help_text="Module that generated the notification (e.g., finance, crm)")
    icon = models.CharField(max_length=50, blank=True, null=True, help_text="Lucide icon name")
    title = models.CharField(max_length=255)
    message = models.TextField()
    link = models.CharField(max_length=500, blank=True, null=True)
    aggregate_key = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    aggregate_count = models.PositiveIntegerField(default=1)
    metadata = models.JSONField(blank=True, null=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "is_read"]),
            models.Index(fields=["recipient", "is_read", "aggregate_key"]),
        ]

    def __str__(self):
        return f"{self.notification_type}: {self.title} to {self.recipient.username}"


class PushSubscription(BaseTenantModel):
    """
    Saves the user's browser push endpoint and keys.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)

    # Metadata for filtering/cleanup
    browser = models.CharField(max_length=50, blank=True)
    device = models.CharField(max_length=50, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Assinatura Push"
        verbose_name_plural = "Assinaturas Push"

    def __str__(self):
        return f"Push sub for {self.user.username} ({self.browser or 'unknown'})"
