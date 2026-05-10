import uuid

from django.conf import settings
from django.db import models

from shared_kernel.models import BaseTenantModel
from shared_kernel.utils import tenant_upload_to
from shared_kernel.validators import validate_avatar, validate_image


class CompanyManager(models.Manager):
    """Default manager — returns only active (non-deactivated) companies."""

    def get_queryset(self):
        return super().get_queryset().filter(is_active=True)


class Company(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    domain = models.CharField(max_length=255, blank=True, null=True, unique=True)
    branding = models.JSONField(default=dict, blank=True)

    # A4: Soft-delete — deactivate instead of hard-delete to preserve audit trail
    # and avoid cascading deletes across all tenant data.
    is_active = models.BooleanField(
        default=True, db_index=True, help_text="Inactive companies are hidden from the API but data is preserved."
    )
    deactivated_at = models.DateTimeField(
        null=True, blank=True, help_text="Set automatically when is_active is flipped to False."
    )

    LANGUAGE_CHOICES = [
        ("pt-br", "Português (Brasil)"),
        ("en-us", "English (US)"),
    ]
    language_code = models.CharField(
        max_length=10,
        choices=LANGUAGE_CHOICES,
        default="pt-br",
        help_text="Default language for this tenant's users.",
    )

    # Onboarding state
    onboarding_completed = models.BooleanField(default=False)
    onboarding_step = models.IntegerField(default=1)  # 1: Identity, 2: Visual, 3: Connectivity, 4: Domain

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Managers
    objects = CompanyManager()  # default: active companies only
    all_companies = models.Manager()  # bypass soft-delete (admin, migrations, integrity checks)

    def __str__(self):
        return self.name

    def deactivate(self, save=True):
        """Soft-delete this company. Preserves all tenant data."""
        from django.utils import timezone

        self.is_active = False
        self.deactivated_at = timezone.now()
        if save:
            self.save(update_fields=["is_active", "deactivated_at"])

    def reactivate(self, save=True):
        """Restore a previously deactivated company."""
        self.is_active = True
        self.deactivated_at = None
        if save:
            self.save(update_fields=["is_active", "deactivated_at"])


class TenantBranding(models.Model):
    """
    Configurações de white-label por tenant/empresa.
    Permite personalizar logo, ícone e cores da interface.
    """

    PALETTE_CHOICES = (
        ("django-green", "Django Green"),
        ("ocean-blue", "Ocean Blue"),
        ("royal-purple", "Royal Purple"),
        ("sunset-orange", "Sunset Orange"),
        ("forest-green", "Forest Green"),
        ("slate-gray", "Slate Gray"),
    )

    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="theme_branding")
    company_name = models.CharField(
        max_length=200, help_text="Nome customizado da empresa (pode diferir do Company.name)"
    )
    logo = models.ImageField(
        upload_to=tenant_upload_to("branding/logos"),
        blank=True,
        null=True,
        validators=[validate_image],
        help_text="Logo da empresa (PNG/JPEG/WebP, max 10MB)",
    )
    icon = models.ImageField(
        upload_to=tenant_upload_to("branding/icons"),
        blank=True,
        null=True,
        validators=[validate_avatar],
        help_text="Ícone/favicon (ICO/PNG, max 2MB, recomendado 32x32 ou 64x64)",
    )
    primary_color = models.CharField(
        max_length=7, default="#0C4B33", help_text="Cor primária em hexadecimal (ex: #0C4B33)"
    )
    secondary_color = models.CharField(
        max_length=7, default="#111827", help_text="Cor secundária em hexadecimal (ex: #111827)"
    )
    background_color = models.CharField(
        max_length=7, default="#FFFFFF", help_text="Cor de fundo em hexadecimal (ex: #FFFFFF)"
    )
    font_family = models.CharField(
        max_length=100, default="Inter", help_text="Nome da Fonte Google (ex: Inter, Roboto, Montserrat)"
    )
    theme_palette = models.CharField(
        max_length=50,
        choices=PALETTE_CHOICES,
        default="django-green",
        help_text="Paleta de cores pré-estabelecida (opcional se usar cores customizadas)",
    )

    # Custom Code Injection
    custom_css = models.TextField(blank=True, help_text="Custom CSS para ser injetado no cabeçalho")
    custom_js = models.TextField(blank=True, help_text="Custom JS para ser injetado antes do fechamento do body")

    # Footer Customization
    footer_text = models.CharField(
        max_length=255, blank=True, help_text="Texto exibido no rodapé (ex: Todos os direitos reservados)"
    )
    facebook_url = models.URLField(blank=True, null=True)
    instagram_url = models.URLField(blank=True, null=True)
    linkedin_url = models.URLField(blank=True, null=True)
    twitter_url = models.URLField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Tenant Branding"
        verbose_name_plural = "Tenant Brandings"

    def __str__(self):
        return f"Branding for {self.company.name}"


class TenantEmailConfig(models.Model):
    """
    Configurações de SMTP customizado por tenant.
    """

    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="email_config")
    use_custom_smtp = models.BooleanField(
        default=False, help_text="Se ativado, utiliza as configurações abaixo em vez do SMTP padrão do sistema."
    )
    smtp_host = models.CharField(max_length=255, blank=True)
    smtp_port = models.IntegerField(default=587)
    smtp_user = models.CharField(max_length=255, blank=True)

    # SECURITY: Encrypted password storage
    smtp_password_encrypted = models.BinaryField(blank=True, null=True, help_text="Senha SMTP criptografada")

    smtp_use_tls = models.BooleanField(default=True)
    from_email = models.EmailField(blank=True, help_text="E-mail remetente (ex: contato@empresa.com)")

    def set_smtp_password(self, raw_password: str):
        """
        Encrypts and stores the SMTP password securely.

        Args:
            raw_password: Plain text password to encrypt
        """
        from shared_kernel.encryption import encrypt_value

        if raw_password:
            self.smtp_password_encrypted = encrypt_value(raw_password)
        else:
            self.smtp_password_encrypted = b""

    def get_smtp_password(self) -> str:
        """
        Retrieves and decrypts the SMTP password.

        Returns:
            Decrypted password string, or empty string if not set
        """
        from shared_kernel.encryption import decrypt_value

        # Try encrypted field first
        if self.smtp_password_encrypted:
            return decrypt_value(self.smtp_password_encrypted)

        # Fallback: no encrypted password
        return ""

    def __str__(self):
        return f"SMTP Config for {self.company.name}"


class AuditLog(BaseTenantModel):
    """
    Registro de auditoria de ações críticas.
    """

    ACTION_CHOICES = (
        ("create", "Create"),
        ("update", "Update"),
        ("delete", "Delete"),
        ("login", "Login"),
        ("logout", "Logout"),
        ("export", "Export"),
        ("other", "Other"),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    resource = models.CharField(max_length=100, help_text="Ex: User, Article, Settings")
    resource_id = models.CharField(max_length=100, blank=True, null=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "created_at"], name="audit_company_created_idx"),
            models.Index(fields=["company", "action"], name="audit_company_action_idx"),
            models.Index(fields=["company", "user"], name="audit_company_user_idx"),
            models.Index(fields=["resource", "resource_id"], name="audit_resource_idx"),
        ]

    def __str__(self):
        return f"{self.user} - {self.action} {self.resource} - {self.created_at}"


class LDAPConfig(models.Model):
    """
    Configuração LDAP por tenant para autenticação centralizada.
    Permite que cada empresa configure seu próprio servidor LDAP/Active Directory.
    """

    company = models.OneToOneField(Company, on_delete=models.CASCADE, related_name="ldap_config")

    # Habilitação
    enabled = models.BooleanField(default=False, help_text="Ativar autenticação LDAP para esta empresa")

    # Configurações de Servidor
    server_uri = models.CharField(
        max_length=255,
        blank=True,
        help_text="URI do servidor LDAP (ex: ldap://ldap.empresa.com:389 ou ldaps://ldap.empresa.com:636)",
    )
    bind_dn = models.CharField(max_length=255, blank=True, help_text="DN para bind (ex: cn=admin,dc=empresa,dc=com)")
    bind_password_encrypted = models.BinaryField(blank=True, null=True, help_text="Senha do bind DN (criptografada)")

    # Base de Busca
    user_search_base = models.CharField(
        max_length=255, blank=True, help_text="Base DN para buscar usuários (ex: ou=users,dc=empresa,dc=com)"
    )
    user_search_filter = models.CharField(
        max_length=255, default="(uid=%(user)s)", help_text="Filtro de busca LDAP - use %(user)s como placeholder"
    )

    # Mapeamento de Atributos
    attr_username = models.CharField(max_length=50, default="uid", help_text="Atributo LDAP para username")
    attr_email = models.CharField(max_length=50, default="mail", help_text="Atributo LDAP para email")
    attr_first_name = models.CharField(max_length=50, default="givenName", help_text="Atributo LDAP para primeiro nome")
    attr_last_name = models.CharField(max_length=50, default="sn", help_text="Atributo LDAP para sobrenome")

    # Configurações Avançadas
    use_tls = models.BooleanField(default=True, help_text="Usar StartTLS para conexão segura")
    require_group = models.CharField(
        max_length=255, blank=True, help_text="DN do grupo LDAP obrigatório para acesso (opcional)"
    )
    admin_group_dn = models.CharField(
        max_length=255, blank=True, help_text="DN do grupo LDAP para administradores (opcional)"
    )

    # Status de Teste
    last_test_status = models.CharField(
        max_length=20,
        choices=[("success", "Sucesso"), ("failed", "Falha"), ("pending", "Pendente")],
        default="pending",
        help_text="Status do último teste de conexão",
    )
    last_test_message = models.TextField(blank=True, help_text="Mensagem do último teste de conexão")
    last_test_at = models.DateTimeField(null=True, blank=True, help_text="Data/hora do último teste")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def set_bind_password(self, raw_password: str):
        """Criptografa e armazena a senha do bind DN."""
        from shared_kernel.encryption import encrypt_value

        if raw_password:
            self.bind_password_encrypted = encrypt_value(raw_password)
        else:
            self.bind_password_encrypted = b""

    def get_bind_password(self) -> str:
        """Recupera e descriptografa a senha do bind DN."""
        from shared_kernel.encryption import decrypt_value

        if self.bind_password_encrypted:
            return decrypt_value(self.bind_password_encrypted)
        return ""

    class Meta:
        verbose_name = "Configuração LDAP"
        verbose_name_plural = "Configurações LDAP"

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.enabled:
            if not self.server_uri:
                raise ValidationError({"server_uri": "A URI do servidor é obrigatória se o LDAP estiver habilitado."})
            if not self.server_uri.startswith(("ldap://", "ldaps://")):
                raise ValidationError({"server_uri": "A URI deve começar com ldap:// ou ldaps://."})
            if not self.bind_dn:
                raise ValidationError({"bind_dn": "Bind DN é obrigatório se o LDAP estiver habilitado."})
            if not self.user_search_base:
                raise ValidationError({"user_search_base": "A base de busca é obrigatória se o LDAP estiver habilitado."})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        status = "✓ Ativo" if self.enabled else "✗ Inativo"
        return f"LDAP {status} - {self.company.name}"
