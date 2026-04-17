from django.db import models
from django.conf import settings
from shared_kernel.models import BaseTenantModel

class CIType(BaseTenantModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True, help_text="Lucide icon name")
    
    # ITIL Version 5 specific metadata
    criticality_level = models.IntegerField(default=1, help_text="Impact severity (1-5)")

    class Meta:
        unique_together = ("company", "name")

    def __str__(self):
        return self.name

class CI(BaseTenantModel):
    STATUS_CHOICES = [
        ("active", "Ativo / Produção"),
        ("stored", "Estocado"),
        ("retired", "Aposentado"),
        ("broken", "Quebrado / Manutenção"),
        ("ordered", "Em Compra"),
    ]

    ci_type = models.ForeignKey(CIType, on_delete=models.CASCADE, related_name="cis")
    name = models.CharField(max_length=200)
    serial_number = models.CharField(max_length=100, blank=True, null=True)
    asset_tag = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="owned_cis")
    location = models.CharField(max_length=200, blank=True, null=True)
    
    # Dynamic attributes for flexible inventory
    attributes = models.JSONField(default=dict, blank=True, help_text="JSON payload with CI specific specs")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.ci_type.name}] {self.name}"

class CIRelationship(BaseTenantModel):
    RELATION_KIND_CHOICES = [
        ("runs_on", "Roda em"),
        ("depends_on", "Depende de"),
        ("member_of", "Membro de"),
        ("manages", "Gerencia"),
        ("installed_on", "Instalado em"),
    ]

    source = models.ForeignKey(CI, on_delete=models.CASCADE, related_name="outgoing_relations")
    target = models.ForeignKey(CI, on_delete=models.CASCADE, related_name="incoming_relations")
    relation_kind = models.CharField(max_length=30, choices=RELATION_KIND_CHOICES)
    
    description = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f"{self.source.name} --({self.relation_kind})--> {self.target.name}"
