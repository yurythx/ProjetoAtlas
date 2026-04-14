from django.db import models

from shared_kernel.models import BaseTenantModel


class Module(models.Model):
    """
    Módulos do sistema que podem ser ativados/desativados (ex: 'articles', 'messenger', 'pages').
    Globais.
    """

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_default = models.BooleanField(default=False, help_text="Se ativado por padrão para novas empresas")

    def __str__(self):
        return self.name


class TenantModule(BaseTenantModel):
    """
    Configuração de módulos por tenant.
    """

    module = models.ForeignKey(Module, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)
    config = models.JSONField(
        default=dict, blank=True, help_text="Configurações específicas do módulo para este tenant"
    )

    class Meta:
        unique_together = ("company", "module")

    def __str__(self):
        return f"{self.company.name} - {self.module.name}"
