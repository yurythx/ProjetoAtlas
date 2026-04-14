import hashlib
import hmac
import secrets

from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from shared_kernel.models import BaseTenantModel


class APIKey(BaseTenantModel):
    name = models.CharField(_("Nome da Chave"), max_length=100, help_text=_("Ex: Integração Site Externo"))
    prefix = models.CharField(max_length=16, unique=True, editable=False)
    hashed_key = models.CharField(max_length=128, editable=False)

    # Scopes: list of strings defining what this key can access
    # e.g. ["articles.read", "messenger.send"]
    scopes = models.JSONField(_("Escopos de Acesso"), default=list)

    is_active = models.BooleanField(_("Ativo"), default=True)
    expires_at = models.DateTimeField(_("Expira em"), null=True, blank=True)
    last_used_at = models.DateTimeField(_("Último Uso"), null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Chave de API")
        verbose_name_plural = _("Chaves de API")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.prefix}...)"

    @staticmethod
    def generate_raw_key():
        return secrets.token_urlsafe(32)

    def set_key(self, raw_key):
        self.hashed_key = hashlib.sha256(raw_key.encode()).hexdigest()

    def verify_key(self, raw_key):
        return hmac.compare_digest(self.hashed_key, hashlib.sha256(raw_key.encode()).hexdigest())

    def is_valid(self):
        if not self.is_active:
            return False
        if self.expires_at and self.expires_at < timezone.now():
            return False
        return True


class APIKeyUser:
    """
    Objeto de usuário virtual para requisições autenticadas via API Key.
    Garante compatibilidade com middlewares e permissões que esperam um objeto de usuário.
    """

    is_authenticated = True
    is_staff = False
    is_superuser = False
    is_active = True

    def __init__(self, company, name="API Key User"):
        self.company = company
        self.username = f"api_key_{company.slug}"
        self.name = name
        self.pk = None
        self.id = None

    def __str__(self):
        return f"APIKeyUser({self.company.slug})"

    def has_perm(self, perm, obj=None):
        # Implementação básica: API Keys por enquanto não têm permissões granulares de nível de objeto do Django Auth
        return False

    def has_module_perms(self, app_label):
        return False
