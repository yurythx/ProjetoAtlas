from django.conf import settings
from django.db import models

from shared_kernel.models import BaseTenantModel
from shared_kernel.utils import tenant_upload_to
from shared_kernel.validators import validate_chat_file


class SoftDeleteManager(models.Manager):
    """Default manager that excludes soft-deleted messages."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class Conversation(BaseTenantModel):
    """
    Uma conversa entre usuários.
    """

    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="conversations")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Metadados opcionais (ex: título de grupo)
    title = models.CharField(max_length=255, blank=True, null=True)
    is_group = models.BooleanField(default=False)

    def __str__(self):
        if self.title:
            return self.title
        return f"Conversation {self.id}"

    def unread_count(self, user):
        """Convenience method — prefer queryset annotation for list views."""
        return self.messages.filter(is_read=False).exclude(sender=user).count()


class Message(BaseTenantModel):
    """
    Uma mensagem dentro de uma conversa.

    Soft delete: ao invés de excluir do banco, marcamos `is_deleted=True`.
    O conteúdo é apagado e o arquivo removido para evitar exposição de dados.
    """

    conversation = models.ForeignKey(Conversation, related_name="messages", on_delete=models.CASCADE)
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="sent_messages", on_delete=models.CASCADE)
    content = models.TextField(blank=True, null=True)

    # File attachments
    file = models.FileField(
        upload_to=tenant_upload_to("chat/attachments"),
        blank=True,
        null=True,
        validators=[validate_chat_file],
        help_text="Anexo (Imagens/Documentos, max 10MB)",
    )
    file_name = models.CharField(max_length=255, blank=True, null=True)
    file_type = models.CharField(max_length=100, blank=True, null=True)
    file_size = models.BigIntegerField(blank=True, null=True)
    client_id = models.UUIDField(blank=True, null=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)

    # Soft delete
    is_deleted = models.BooleanField(default=False, db_index=True)

    # Reply reference
    reply_to = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replies")

    # managers
    objects = SoftDeleteManager()  # default: excludes deleted
    all_objects = models.Manager()  # includes deleted (admin / integrity checks)

    class Meta:
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["conversation", "is_read", "sender"]),
        ]

    def __str__(self):
        return f"Message {self.id} from {self.sender}"

    def soft_delete(self):
        """
        Marks the message as deleted, clears its content and file reference.
        This ensures no data is leaked while maintaining conversation thread integrity.
        """
        self.is_deleted = True
        self.content = None
        # Clear file reference (the file itself may be deleted by a periodic task)
        self.file = None
        self.file_name = None
        self.file_type = None
        self.file_size = None
        self.save(update_fields=["is_deleted", "content", "file", "file_name", "file_type", "file_size"])


class MessageRead(BaseTenantModel):
    message = models.ForeignKey(Message, related_name="reads", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="message_reads", on_delete=models.CASCADE)
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")
        indexes = [
            models.Index(fields=["message", "user"]),
            models.Index(fields=["user", "read_at"]),
        ]

    def __str__(self):
        return f"MessageRead user={self.user_id} message={self.message_id}"


class MessageDelivery(BaseTenantModel):
    message = models.ForeignKey(Message, related_name="deliveries", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="message_deliveries", on_delete=models.CASCADE)
    delivered_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user")
        indexes = [
            models.Index(fields=["message", "user"]),
            models.Index(fields=["user", "delivered_at"]),
        ]

    def __str__(self):
        return f"MessageDelivery user={self.user_id} message={self.message_id}"


class MessageReaction(BaseTenantModel):
    """
    Reações em mensagens (ex: 👍, ❤️).
    """

    message = models.ForeignKey(Message, related_name="reactions", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="message_reactions", on_delete=models.CASCADE)
    emoji = models.CharField(max_length=10)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("message", "user", "emoji")
        indexes = [
            models.Index(fields=["message", "emoji"]),
        ]

    def __str__(self):
        return f"{self.user} reacted {self.emoji} to {self.message_id}"


class ConversationPreference(BaseTenantModel):
    """
    Preferências por usuário por conversa: silenciar e fixar.

    Substitui o armazenamento em localStorage, tornando as preferências
    persistentes entre dispositivos e sessões.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="conversation_preferences"
    )
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="preferences")
    is_muted = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    cleared_at = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("user", "conversation")
        indexes = [
            models.Index(fields=["user", "is_pinned"]),
            models.Index(fields=["user", "is_muted"]),
            models.Index(fields=["user", "is_deleted"]),
            models.Index(fields=["user", "is_archived"]),
        ]

    def __str__(self):
        return f"{self.user} prefs for conv {self.conversation_id}"


class ContactBlock(BaseTenantModel):
    """
    Bloqueio de contatos entre usuários.
    Garante que as preferências de bloqueio sejam persistidas no backend.
    """

    blocker = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="blocked_contacts", on_delete=models.CASCADE)
    blocked = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="blocked_by", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("blocker", "blocked")
        indexes = [
            models.Index(fields=["blocker", "blocked"]),
        ]

    def __str__(self):
        return f"{self.blocker} blocked {self.blocked}"
