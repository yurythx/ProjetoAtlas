import secrets

from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.utils import timezone

from shared_kernel.models import BaseTenantModel
from shared_kernel.tenant_context import get_current_company
from shared_kernel.utils import tenant_upload_to


class TenantUserManager(UserManager):
    def get_queryset(self):
        company = get_current_company()
        qs = super().get_queryset()
        if company:
            return qs.filter(company=company)
        # Fallback seguro: sem contexto de empresa, não retorna nada
        return qs.none()


class Role(BaseTenantModel):
    """
    Papéis de usuário dentro de um tenant.
    Ex: Administrador, Editor, Visualizador.
    """

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    # Lista de permissões no formato slug (ex: ["articles.create", "media.upload"])
    permissions = models.JSONField(default=list, help_text="Lista de slugs de permissões atribuídas a esta role")
    is_system_role = models.BooleanField(default=False, help_text="Se True, não pode ser editada ou excluída")

    class Meta:
        verbose_name = "Role"
        verbose_name_plural = "Roles"
        unique_together = ("company", "name")

    def __str__(self):
        return f"{self.name} ({self.company.name if self.company else 'System'})"


class User(AbstractUser, BaseTenantModel):
    # Relacionamento com Role
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True, related_name="users")
    avatar = models.ImageField(
        upload_to=tenant_upload_to("avatars"), null=True, blank=True, help_text="Foto de perfil do usuário"
    )
    bio = models.TextField(blank=True, default="", help_text="Bio curta do usuário (exibida no perfil e em conteúdos)")

    last_seen = models.DateTimeField(null=True, blank=True, help_text="Última vez visto online")
    status = models.CharField(
        max_length=20,
        choices=[
            ("online", "Online"),
            ("busy", "Ocupado"),
            ("offline", "Offline"),
        ],
        default="online",
        help_text="Status de presença do usuário",
    )

    crm_groups = models.ManyToManyField("crm.CRMGroup", blank=True, related_name="users")

    # Managers
    objects = TenantUserManager()  # Tenant-aware default manager
    all_objects = UserManager()  # Global manager for auth and cross-tenant ops

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"
        default_manager_name = "all_objects"
        indexes = [
            models.Index(fields=["company", "last_seen"], name="user_company_last_seen_idx"),
            models.Index(fields=["company", "role"], name="user_company_role_idx"),
            models.Index(fields=["last_seen"], name="user_last_seen_idx"),
        ]


class UserThemePreference(models.Model):
    """
    Preferências de tema personalizadas por usuário.
    Permite que cada usuário escolha uma paleta de cores própria,
    diferente do tema da empresa, salvando no seu perfil.
    """

    PALETTE_CHOICES = (
        ("django-green", "Django Green"),
        ("ocean-blue", "Ocean Blue"),
        ("royal-purple", "Royal Purple"),
        ("sunset-orange", "Sunset Orange"),
        ("forest-green", "Forest Green"),
        ("slate-gray", "Slate Gray"),
    )

    DARK_MODE_CHOICES = (
        ("light", "Light"),
        ("dark", "Dark"),
        ("system", "System"),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="theme_preference")
    theme_palette = models.CharField(
        max_length=50,
        choices=PALETTE_CHOICES,
        null=True,
        blank=True,
        help_text="Paleta escolhida pelo usuário (null = usa tema da empresa)",
    )
    use_tenant_theme = models.BooleanField(
        default=True, help_text="Se True, ignora theme_palette e usa o tema da empresa"
    )
    dark_mode_preference = models.CharField(
        max_length=10,
        choices=DARK_MODE_CHOICES,
        default="system",
        help_text="Preferência de modo escuro (independente do tema)",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Theme Preference"
        verbose_name_plural = "User Theme Preferences"

    def __str__(self):
        palette = self.theme_palette if not self.use_tenant_theme else "Tenant Theme"
        return f"{self.user.username} - {palette}"


class UserNotificationPreference(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="notification_preference")
    notify_moderation_comment_pending = models.BooleanField(
        default=True, help_text="Receber notificações quando houver comentários pendentes"
    )
    notify_moderation_reply_pending = models.BooleanField(
        default=True, help_text="Receber notificações quando houver respostas pendentes"
    )
    notify_moderation_article_pending = models.BooleanField(
        default=True, help_text="Receber notificações quando houver artigos pendentes"
    )
    notify_reply_approved_single = models.BooleanField(
        default=True, help_text="Receber notificação quando uma resposta ao seu comentário for aprovada"
    )
    notify_reply_approved_thread = models.BooleanField(
        default=True, help_text="Receber notificação quando replies forem aprovadas na sua thread"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Notification Preference"
        verbose_name_plural = "User Notification Preferences"

    def __str__(self):
        return f"{self.user.username} notifications"


class Invitation(BaseTenantModel):
    """
    Convite para um novo usuário se juntar à empresa.
    """

    email = models.EmailField(db_index=True)
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="invitations")
    crm_groups = models.ManyToManyField("crm.CRMGroup", blank=True, related_name="invitations")
    token = models.CharField(max_length=64, unique=True, default=secrets.token_urlsafe)
    invited_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="sent_invitations")
    status = models.CharField(
        max_length=20,
        choices=(("pending", "Pending"), ("accepted", "Accepted"), ("expired", "Expired")),
        default="pending",
    )
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            # Convite expira em 7 dias por padrão
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"Invite for {self.email} - {self.company.name}"
