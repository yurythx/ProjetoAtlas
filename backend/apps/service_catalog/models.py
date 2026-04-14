from django.db import models
from apps.crm.models import SLAPolicy
from shared_kernel.models import BaseTenantModel

class ServiceCategory(BaseTenantModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    icon = models.CharField(max_length=50, blank=True, null=True, help_text="Lucide icon name")

    class Meta:
        verbose_name_plural = "Service Categories"
        unique_together = ("company", "name", "parent")

    def __str__(self):
        return self.name

class ServiceDefinition(BaseTenantModel):
    category = models.ForeignKey(ServiceCategory, on_delete=models.CASCADE, related_name="services")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    owner = models.ForeignKey("accounts.User", on_delete=models.SET_NULL, null=True, blank=True, help_text="Service Owner (ITIL)")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.category.name} > {self.name}"

class ServiceItem(BaseTenantModel):
    DEFINITION_RECORD_TYPE_CHOICES = [
        ("incident", "Incidente"),
        ("service_request", "Requisição de Serviço"),
        ("problem", "Problema"),
        ("change", "Mudança"),
    ]

    definition = models.ForeignKey(ServiceDefinition, on_delete=models.CASCADE, related_name="items")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    record_type = models.CharField(max_length=20, choices=DEFINITION_RECORD_TYPE_CHOICES, default="service_request")
    default_sla_policy = models.ForeignKey(SLAPolicy, on_delete=models.SET_NULL, null=True, blank=True)
    
    estimated_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    is_active = models.BooleanField(default=True)

    # ITIL v5 governance
    approval_required = models.BooleanField(default=False)
    knowledge_base_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return f"{self.definition.name} - {self.name}"
