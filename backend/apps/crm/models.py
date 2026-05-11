import unicodedata
import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.utils.text import slugify

from shared_kernel.models import BaseTenantModel


def normalize_column_semantic_text(value):
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(without_accents.lower().strip().split())


def get_column_semantic_defaults(title=None, column_kind=None):
    semantic_by_kind = {
        "backlog": {
            "column_kind": "backlog",
            "marks_done": False,
            "requires_schedule": False,
            "requires_assignee": False,
        },
        "planned": {
            "column_kind": "planned",
            "marks_done": False,
            "requires_schedule": True,
            "requires_assignee": True,
        },
        "active": {
            "column_kind": "active",
            "marks_done": False,
            "requires_schedule": False,
            "requires_assignee": False,
        },
        "done": {
            "column_kind": "done",
            "marks_done": True,
            "requires_schedule": False,
            "requires_assignee": False,
        },
        "custom": {
            "column_kind": "custom",
            "marks_done": False,
            "requires_schedule": False,
            "requires_assignee": False,
        },
    }

    if column_kind in semantic_by_kind:
        return semantic_by_kind[column_kind].copy()

    normalized_title = normalize_column_semantic_text(title)

    if normalized_title in {"novo", "new", "backlog"}:
        inferred_kind = "backlog"
    elif "planejad" in normalized_title or "agendad" in normalized_title:
        inferred_kind = "planned"
    elif any(token in normalized_title for token in ["andamento", "execucao", "progresso", "in progress", "doing"]):
        inferred_kind = "active"
    elif any(token in normalized_title for token in ["concluid", "finaliz", "encerr", "done", "closed"]):
        inferred_kind = "done"
    else:
        inferred_kind = "custom"

    return semantic_by_kind[inferred_kind].copy()


class Contact(BaseTenantModel):
    """Representa um cliente ou usuário final."""

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=50, blank=True, null=True)
    company_name = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Contact"
        verbose_name_plural = "Contacts"
        indexes = [
            GinIndex(name="crm_contact_name_gin", fields=["name"], opclasses=["gin_trgm_ops"]),
            GinIndex(name="crm_contact_email_gin", fields=["email"], opclasses=["gin_trgm_ops"]),
        ]

    def __str__(self):
        return self.name


class CRMGroup(BaseTenantModel):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)

    class Meta:
        verbose_name = "CRM Group"
        verbose_name_plural = "CRM Groups"
        unique_together = [
            ("company", "slug"),
            ("company", "name"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)[:140] or "grupo"
        super().save(*args, **kwargs)


class Pipeline(BaseTenantModel):
    """Fluxo de trabalho (ex: Suporte TI, Comercial, Projetos)."""

    VISIBILITY_CHOICES = [
        ("company", "Empresa"),
        ("group", "Grupo"),
    ]

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default="company")
    groups = models.ManyToManyField(CRMGroup, blank=True, related_name="pipelines")

    class Meta:
        verbose_name = "Pipeline"
        verbose_name_plural = "Pipelines"

    def __str__(self):
        return self.name


class Stage(BaseTenantModel):
    """Etapas/Colunas do Kanban vinculadas a um Pipeline."""

    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name="stages")
    name = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Stage"
        verbose_name_plural = "Stages"
        ordering = ["order"]

    def __str__(self):
        return f"{self.pipeline.name} - {self.name}"


class Column(BaseTenantModel):
    """Colunas dinâmicas do pipeline usadas pelo board e integrações."""

    COLUMN_KIND_CHOICES = [
        ("backlog", "Backlog"),
        ("planned", "Planejada"),
        ("active", "Em andamento"),
        ("done", "Concluída"),
        ("custom", "Customizada"),
        # ITIL Version 5 lifecycle
        ("discover", "Descoberta"),
        ("design", "Design"),
        ("acquire", "Aquisição"),
        ("build", "Construção"),
        ("transition", "Transição"),
        ("operate", "Operação"),
        ("deliver", "Entrega"),
        ("support", "Suporte"),
    ]

    VALUE_STREAM_PHASES = [
        ("demand", "Demanda"),
        ("product_design", "Design de Produto"),
        ("creation", "Criação / Desenvolvimento"),
        ("onboarding", "Onboarding / Entrega"),
        ("realization", "Realização de Valor"),
    ]

    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name="columns")
    title = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)
    color = models.CharField(max_length=7, default="#CBD5E1")
    column_kind = models.CharField(max_length=20, choices=COLUMN_KIND_CHOICES, default="custom")
    marks_done = models.BooleanField(default=False)
    requires_schedule = models.BooleanField(default=False)
    requires_assignee = models.BooleanField(default=False)
    allowed_source_columns = models.JSONField(default=list, blank=True)
    wip_limit = models.PositiveIntegerField(blank=True, null=True)
    legacy_stage = models.OneToOneField(Stage, on_delete=models.SET_NULL, related_name="column", blank=True, null=True)
    value_stream_phase = models.CharField(max_length=30, choices=VALUE_STREAM_PHASES, default="demand")

    class Meta:
        verbose_name = "Column"
        verbose_name_plural = "Columns"
        ordering = ["order", "id"]
        indexes = [
            models.Index(fields=["company", "pipeline", "order"]),
        ]

    def __str__(self):
        return f"{self.pipeline.name} - {self.title}"

    def is_done(self):
        return self.marks_done

    def allows_transition_from(self, source_column_id):
        # Sempre permite permanecer na mesma coluna (atualização de dados)
        if source_column_id == self.id:
            return True
            
        if not self.allowed_source_columns:
            return True
        return source_column_id in self.allowed_source_columns


class CRMSavedView(BaseTenantModel):
    """Views salvas por usuário para cada pipeline do CRM."""

    VIEW_MODE_CHOICES = [
        ("kanban", "Kanban"),
        ("list", "Tabela"),
        ("overview", "Visão Geral"),
    ]

    pipeline = models.ForeignKey("Pipeline", on_delete=models.CASCADE, related_name="saved_views")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="crm_saved_views")
    name = models.CharField(max_length=120)
    view_mode = models.CharField(max_length=20, choices=VIEW_MODE_CHOICES, default="kanban")
    filters = models.JSONField(default=dict, blank=True)
    sorting = models.JSONField(default=list, blank=True)
    column_visibility = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name = "CRM Saved View"
        verbose_name_plural = "CRM Saved Views"
        ordering = ["-is_default", "name", "id"]
        unique_together = [("company", "owner", "pipeline", "name")]
        indexes = [
            models.Index(fields=["company", "owner", "pipeline"], name="crm_crmsave_company_6f80c5_idx"),
            models.Index(fields=["company", "owner", "is_default"], name="crm_crmsave_company_1a23fd_idx"),
        ]

    def __str__(self):
        return f"{self.owner} - {self.pipeline.name} - {self.name}"


class SLAPolicy(BaseTenantModel):
    """Política de SLA conforme ITIL Version 5."""

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    target_response_minutes = models.PositiveIntegerField(help_text="Tempo alvo para primeira resposta em minutos")
    target_resolution_minutes = models.PositiveIntegerField(help_text="Tempo alvo para resolução em minutos")
    business_hours_only = models.BooleanField(default=True)

    class Meta:
        verbose_name = "SLA Policy"
        verbose_name_plural = "SLA Policies"

    def __str__(self):
        return self.name


class Deal(BaseTenantModel):
    """O Card/Item do Kanban (pode ser um Chamado de TI ou Oportunidade)."""

    PRIORITY_CHOICES = [
        ("LOW", "Baixa"),
        ("MEDIUM", "Média"),
        ("HIGH", "Alta"),
        ("URGENT", "Crítica / Urgente"),
    ]

    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    RECORD_TYPE_CHOICES = [
        ("incident", "Incidente"),
        ("service_request", "Requisição de Serviço"),
        ("problem", "Problema"),
        ("change", "Mudança"),
        ("opportunity", "Oportunidade"),
    ]
    record_type = models.CharField(max_length=20, choices=RECORD_TYPE_CHOICES, default="incident")

    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="deals")
    stage = models.ForeignKey(Stage, on_delete=models.PROTECT, related_name="deals")
    column = models.ForeignKey("Column", on_delete=models.PROTECT, related_name="cards", blank=True, null=True)

    closing_date = models.DateTimeField(blank=True, null=True, help_text="Data de entrega / Prazo SLA")
    data_agendamento = models.DateTimeField(blank=True, null=True)

    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default="MEDIUM")
    service_item = models.ForeignKey(
        "service_catalog.ServiceItem", on_delete=models.SET_NULL, null=True, blank=True, related_name="deals"
    )
    affected_cis = models.ManyToManyField("cmdb.CI", blank=True, related_name="deals")
    
    # ITIL Version 5 Change Management Fields
    CHANGE_TYPE_CHOICES = [
        ("standard", "Padrão (Baixo Risco)"),
        ("normal", "Normal (Requer CAB)"),
        ("emergency", "Emergencial (Urgente)"),
    ]
    change_type = models.CharField(max_length=20, choices=CHANGE_TYPE_CHOICES, default="normal")

    RISK_LEVEL_CHOICES = [
        ("low", "Baixo"),
        ("medium", "Médio"),
        ("high", "Alto"),
        ("critical", "Crítico"),
    ]
    risk_level = models.CharField(max_length=20, choices=RISK_LEVEL_CHOICES, blank=True, null=True)
    change_justification = models.TextField(blank=True, null=True)
    change_impact = models.TextField(blank=True, null=True)
    implementation_plan = models.TextField(blank=True, null=True)
    backout_plan = models.TextField(blank=True, null=True)
    test_plan = models.TextField(blank=True, null=True)
    cab_approval = models.BooleanField(default=False)
    cab_date = models.DateTimeField(blank=True, null=True)
    
    # ITIL Version 5 Problem Management Fields
    root_cause = models.TextField(blank=True, null=True)
    workaround = models.TextField(blank=True, null=True)
    resolution_steps = models.TextField(blank=True, null=True)
    is_known_error = models.BooleanField(default=False)
    
    # DPSM Experience
    xla_score = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True, help_text="Average XLA score (1-10)")
    ai_metadata = models.JSONField(default=dict, blank=True, help_text="AI Insights, Risk Analysis, and Actionable Intelligence")

    value = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    integration_source = models.CharField(max_length=50, default="manual")
    external_id = models.CharField(max_length=255, blank=True, null=True)

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="deals")
    tecnico_responsavel = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="scheduled_deals",
        blank=True,
        null=True,
    )

    is_closed = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)

    # SLA ITIL Version 5
    sla_policy = models.ForeignKey(SLAPolicy, on_delete=models.SET_NULL, null=True, blank=True, related_name="deals")
    sla_response_deadline = models.DateTimeField(blank=True, null=True)
    sla_resolution_deadline = models.DateTimeField(blank=True, null=True)
    first_response_at = models.DateTimeField(blank=True, null=True)

    SLA_STATUS_CHOICES = [
        ("within", "Dentro do prazo"),
        ("at_risk", "Em risco"),
        ("breached", "Violado"),
    ]
    sla_status = models.CharField(max_length=20, choices=SLA_STATUS_CHOICES, default="within")

    # Campo para rastrear o ID do evento no calendário vinculado (loose coupling)
    linked_event_id = models.IntegerField(blank=True, null=True)

    # Campos Customizados Flexíveis (JSON)
    custom_fields = models.JSONField(default=dict, blank=True, help_text="Campos dinâmicos do deal")

    messenger_conversation = models.ForeignKey(
        "messenger.Conversation",
        on_delete=models.SET_NULL,
        related_name="crm_deals",
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "Deal"
        verbose_name_plural = "Deals"
        indexes = [
            models.Index(fields=["company", "stage"]),
            models.Index(fields=["company", "column"]),
            models.Index(fields=["closing_date"]),
            models.Index(fields=["company", "external_id"]),
            models.Index(fields=["company", "record_type"]),
            models.Index(fields=["company", "sla_status"]),
            GinIndex(name="crm_deal_title_gin", fields=["title"], opclasses=["gin_trgm_ops"]),
            # Composite indexes for the most common filtered list queries
            models.Index(fields=["company", "is_deleted"], name="crm_deal_company_deleted_idx"),
            models.Index(fields=["company", "is_deleted", "column"], name="crm_deal_company_deleted_col_idx"),
            models.Index(fields=["company", "owner"], name="crm_deal_company_owner_idx"),
            models.Index(fields=["company", "sla_resolution_deadline"], name="crm_deal_sla_deadline_idx"),
        ]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        old_instance = None
        if not is_new:
            try:
                old_instance = Deal.objects.get(pk=self.pk)
            except Deal.DoesNotExist:
                pass

        # Cálculo automático de progresso baseado na coluna
        resolved_column = self.column or getattr(self.stage, "column", None)
        if resolved_column:
            pipeline = resolved_column.pipeline
            # Cache pipeline columns for 5 minutes — they rarely change and this query
            # fires on every Deal.save(), making it a hot path under load.
            from django.core.cache import cache
            cache_key = f"pipeline_columns_{pipeline.pk}"
            all_columns = cache.get(cache_key)
            if all_columns is None:
                all_columns = list(Column.objects.filter(pipeline=pipeline).order_by("order"))
                cache.set(cache_key, all_columns, 300)
            if all_columns:
                try:
                    current_index = all_columns.index(resolved_column)
                    if resolved_column.marks_done or current_index == len(all_columns) - 1:
                        progress = 100
                    else:
                        progress = int((current_index / (len(all_columns) - 1)) * 100)

                    if progress >= 100 or resolved_column.marks_done:
                        self.is_closed = True
                        progress = 100
                    else:
                        self.is_closed = False

                    if self.custom_fields is None:
                        self.custom_fields = {}

                    updated_custom_fields = dict(self.custom_fields)
                    updated_custom_fields["progress_percentage"] = progress
                    self.custom_fields = updated_custom_fields
                except ValueError:
                    pass

        super().save(*args, **kwargs)

        # --- Gatilhos ITIL Version 5 (Assíncronos via Celery) ---
        from django.db import transaction
        from apps.ai.tasks import analyze_deal_ai_metadata
        from .tasks import orchestrate_swarming, send_xla_whatsapp_poll

        # Captura o ID explicitamente para evitar closure sobre self mutável
        _deal_id = self.id

        # 1. Triagem Inteligente (IA) na criação
        if is_new:
            transaction.on_commit(lambda: analyze_deal_ai_metadata.delay(_deal_id))

        # 2. Orquestração de Swarming para Urgências
        if self.priority == "URGENT" and (is_new or (old_instance and old_instance.priority != "URGENT")):
            transaction.on_commit(lambda: orchestrate_swarming.delay(_deal_id))

        # 3. Automação de XLA no fechamento
        if self.is_closed and (is_new or (old_instance and not old_instance.is_closed)):
            transaction.on_commit(lambda: send_xla_whatsapp_poll.delay(_deal_id))


class DealActivity(BaseTenantModel):
    """
    Auditoria e Histórico do Deal (Mudanças de Coluna, Notas, Automações).
    """
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    activity_type = models.CharField(max_length=50, choices=[
        ("column_change", "Mudança de Coluna"),
        ("stage_change", "Mudança de Coluna (Legado)"),
        ("note", "Nota Manual"),
        ("automation", "Automação"),
        ("creation", "Criação"),
        ("ai_action", "Ação de IA"),
        ("ai_suggestion", "Sugestão de IA"),
    ])
    description = models.TextField()
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["deal", "created_at"], name="crm_dealactivity_deal_created_idx"),
        ]

    def __str__(self):
        return f"{self.activity_type} - {self.deal.title}"


class DealAttachment(BaseTenantModel):
    PHASE_CHOICES = [
        ("before", "Antes"),
        ("during", "Durante"),
        ("after", "Depois"),
    ]

    KIND_CHOICES = [
        ("photo", "Foto"),
        ("file", "Arquivo"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="attachments")
    media = models.ForeignKey("media.Media", on_delete=models.CASCADE, related_name="deal_attachments")
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default="photo")
    phase = models.CharField(max_length=20, choices=PHASE_CHOICES, default="during")
    caption = models.CharField(max_length=255, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_deal_attachments",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "deal", "created_at"]),
            models.Index(fields=["company", "media", "created_at"]),
        ]

    def __str__(self):
        return f"{self.deal_id} - {self.media_id}"


class IntegrationInboundStatus(models.TextChoices):
    RECEIVED = "received", "Recebido"
    PROCESSED = "processed", "Processado"
    FAILED = "failed", "Falhou"


class IntegrationInboundEvent(BaseTenantModel):
    source = models.CharField(max_length=50)
    event_type = models.CharField(max_length=80, default="ticket.upsert")
    external_id = models.CharField(max_length=255)
    request_payload = models.JSONField(default=dict, blank=True)

    status = models.CharField(max_length=20, choices=IntegrationInboundStatus.choices, default=IntegrationInboundStatus.RECEIVED)
    replayed_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replays",
    )
    processed_deal = models.ForeignKey(Deal, on_delete=models.SET_NULL, null=True, blank=True, related_name="integration_events")
    response_status_code = models.IntegerField(null=True, blank=True)
    error = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["company", "source", "created_at"]),
            models.Index(fields=["company", "source", "external_id"]),
            models.Index(fields=["company", "status", "created_at"]),
        ]

    def __str__(self):
        return f"{self.source} - {self.external_id} ({self.status})"

class XLAFeedback(BaseTenantModel):
    """
    Experience Level Agreement Feedback.
    Measures the subjective quality of the digital product/service delivery.
    """
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="xla_feedbacks")
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name="xla_feedbacks")
    
    rating = models.IntegerField(help_text="Rating from 1-10")
    comment = models.TextField(blank=True, null=True)
    
    # Specific DPSM metrics
    ease_of_use = models.IntegerField(default=5)
    speed_satisfaction = models.IntegerField(default=5)
    outcome_satisfaction = models.IntegerField(default=5)
    
    def __str__(self):
        return f"XLA {self.rating}/10 for {self.deal.title}"

class EvolutionConfig(BaseTenantModel):
    """Configurações da instância Evolution API para WhatsApp."""
    instance_name = models.CharField(max_length=100)
    api_url = models.URLField(help_text="URL base da Evolution API")
    api_token = models.CharField(max_length=255)
    
    is_active = models.BooleanField(default=True)
    webhook_token = models.CharField(max_length=100, unique=True, default=uuid.uuid4)
    
    # Defaults for new deals
    default_pipeline = models.ForeignKey("Pipeline", on_delete=models.SET_NULL, null=True, blank=True)
    default_column = models.ForeignKey("Column", on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"WPP: {self.instance_name} ({self.company.name})"

class Swarm(BaseTenantModel):
    """War Room colaborativa para resolução de incidentes críticos (ITIL Version 5 Swarming)."""
    deal = models.OneToOneField(Deal, on_delete=models.CASCADE, related_name="swarm")
    conversation = models.ForeignKey("messenger.Conversation", on_delete=models.SET_NULL, null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    # Participantes (Swarmer Team)
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="swarms")

    class Meta:
        verbose_name = "Swarm Session"
        verbose_name_plural = "Swarm Sessions"

    def __str__(self):
        return f"Swarm: {self.deal.title} ({'Ativo' if self.is_active else 'Encerrado'})"

class CSIEntry(BaseTenantModel):
    """
    Continual Service Improvement (CSI) Register.
    ITIL Version 5 practice for logging and tracking value stream improvements.
    """
    STATUS_CHOICES = [
        ('identified', 'Identificado'),
        ('evaluating', 'Em Avaliação'),
        ('planned', 'Planejado'),
        ('in_progress', 'Em Execução'),
        ('completed', 'Concluído'),
        ('rejected', 'Rejeitado'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Baixa'),
        ('medium', 'Média'),
        ('high', 'Alta'),
        ('critical', 'Crítica'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField()
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='identified')
    
    # Context
    deal = models.ForeignKey(Deal, on_delete=models.SET_NULL, null=True, blank=True, related_name="csi_entries")
    pipeline = models.ForeignKey("Pipeline", on_delete=models.SET_NULL, null=True, blank=True, related_name="csi_entries")
    
    # Solution
    proposed_solution = models.TextField(blank=True, null=True)
    expected_outcome = models.TextField(blank=True, null=True)
    
    # Ownership
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="requested_csi")
    responsible = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_csi")

    class Meta:
        verbose_name = "CSI Entry"
        verbose_name_plural = "CSI Register"
        ordering = ["-created_at"]

    def __str__(self):
        return f"CSI: {self.title} ({self.get_status_display()})"


class MetricSnapshot(BaseTenantModel):
    """Daily snapshot of CRM KPIs for historical trend analysis (ITIL v5)."""
    date = models.DateField(auto_now_add=True)
    pipeline = models.ForeignKey("Pipeline", on_delete=models.CASCADE, related_name="snapshots")
    
    # Core KPIs
    avg_lead_time_days = models.FloatField(default=0.0)
    throughput_weekly = models.IntegerField(default=0)
    sla_compliance_rate = models.FloatField(default=0.0)
    avg_xla_score = models.FloatField(default=0.0)
    
    # Volume metrics
    active_deals_count = models.IntegerField(default=0)
    bottleneck_count = models.IntegerField(default=0)
    
    class Meta:
        verbose_name = "Metric Snapshot"
        verbose_name_plural = "Metric History"
        unique_together = ["date", "pipeline", "company"]
        ordering = ["-date"]

    def __str__(self):
        return f"Snapshot {self.date} - {self.pipeline.name}"


class AutomationRule(BaseTenantModel):
    """
    CRM automation: when trigger fires and conditions match, run an action.
    Triggers: deal_created, deal_moved, sla_breached, deal_closed
    Actions: notify_assignee, send_webhook, assign_user, create_notification
    """

    TRIGGER_CHOICES = [
        ("deal_created", "Card criado"),
        ("deal_moved", "Card movido de coluna"),
        ("sla_breached", "SLA violado"),
        ("deal_closed", "Card fechado"),
    ]

    ACTION_CHOICES = [
        ("notify_assignee", "Notificar responsável"),
        ("send_webhook", "Enviar webhook"),
        ("assign_user", "Atribuir usuário"),
        ("create_notification", "Criar notificação para usuário específico"),
    ]

    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=True)
    pipeline = models.ForeignKey(
        Pipeline, on_delete=models.CASCADE, related_name="automation_rules", null=True, blank=True
    )
    trigger = models.CharField(max_length=50, choices=TRIGGER_CHOICES)
    # Optional JSON conditions: {"priority": "HIGH", "record_type": "incident"}
    conditions = models.JSONField(default=dict, blank=True)
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    # Action-specific config:
    #   notify_assignee: {}
    #   send_webhook: {"url": "https://..."}
    #   assign_user: {"user_id": 42}
    #   create_notification: {"user_id": 42, "title": "...", "message": "..."}
    action_config = models.JSONField(default=dict, blank=True)
    execution_count = models.PositiveIntegerField(default=0)
    last_triggered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Automation Rule"
        verbose_name_plural = "Automation Rules"
        ordering = ["pipeline", "name"]

    def __str__(self):
        return f"{self.name} ({self.get_trigger_display()} → {self.get_action_display()})"

    def matches(self, deal) -> bool:
        """Check whether this rule's conditions match the given deal."""
        cond = self.conditions or {}
        if cond.get("priority") and deal.priority != cond["priority"]:
            return False
        if cond.get("record_type") and deal.record_type != cond["record_type"]:
            return False
        if cond.get("column_id") and str(getattr(deal, "column_id", None)) != str(cond["column_id"]):
            return False
        return True
