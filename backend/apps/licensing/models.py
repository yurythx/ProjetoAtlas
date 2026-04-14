from django.db import models

from shared_kernel.models import BaseTenantModel


class Feature(models.Model):
    """
    Features disponíveis no sistema (ex: 'max_users', 'has_cms', 'api_access').
    Globais (não dependem de tenant).
    """

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Plan(models.Model):
    """
    Planos de assinatura (ex: 'Free', 'Pro', 'Enterprise').
    Globais.
    """

    name = models.CharField(max_length=100, unique=True)
    features = models.ManyToManyField(Feature, through="PlanFeature")
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class PlanFeature(models.Model):
    """
    Vincula Feature a Plan com um valor (limite).
    Ex: Plano Pro -> max_users = 100
    Ex: Plano Free -> max_users = 5
    Ex: Plano Pro -> has_cms = 1 (bool)
    """

    plan = models.ForeignKey(Plan, on_delete=models.CASCADE)
    feature = models.ForeignKey(Feature, on_delete=models.CASCADE)
    value = models.CharField(max_length=100, help_text="Valor ou limite da feature (ex: '100', 'true', 'unlimited')")

    class Meta:
        unique_together = ("plan", "feature")


class License(BaseTenantModel):
    """
    Licença ativa de uma empresa.
    """

    plan = models.ForeignKey(Plan, on_delete=models.PROTECT)
    start_date = models.DateTimeField(auto_now_add=True)
    end_date = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.company.name} - {self.plan.name}"
