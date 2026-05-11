import logging

from django.contrib.auth import get_user_model
from rest_framework import serializers

logger = logging.getLogger(__name__)

from .models import (
    Column,
    Contact,
    CRMGroup,
    CRMSavedView,
    Deal,
    DealActivity,
    DealAttachment,
    EvolutionConfig,
    IntegrationInboundEvent,
    Pipeline,
    SLAPolicy,
    Stage,
    Swarm,
    XLAFeedback,
    CSIEntry,
    get_column_semantic_defaults,
)

User = get_user_model()


def should_omit_legacy_stage_fields(context):
    request = context.get("request")
    if request is None:
        return False

    return request.query_params.get("omit_legacy_stage_fields") == "1"


def should_include_legacy_stage_fields(context):
    request = context.get("request")
    if request is None:
        return False

    return request.query_params.get("include_legacy_stage_fields") == "1"


def should_include_legacy_overview_stages(context):
    request = context.get("request")
    if request is None:
        return False

    return request.query_params.get("include_legacy_overview_stages") == "1"


class DealActivitySerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = DealActivity
        fields = "__all__"
        read_only_fields = ["id", "company", "deal", "actor", "created_at"]

    def get_actor_name(self, obj):
        if obj.actor:
            full_name = (obj.actor.get_full_name() or "").strip()
            return full_name or obj.actor.username
        return "Sistema"


class DealAttachmentSerializer(serializers.ModelSerializer):
    media_file_url = serializers.CharField(source="media.file.url", read_only=True)
    media_file_type = serializers.CharField(source="media.file_type", read_only=True)
    media_file_size = serializers.IntegerField(source="media.file_size", read_only=True)
    media_title = serializers.CharField(source="media.title", read_only=True)
    created_by_username = serializers.SerializerMethodField()

    class Meta:
        model = DealAttachment
        fields = [
            "id",
            "deal",
            "media",
            "media_file_url",
            "media_file_type",
            "media_file_size",
            "media_title",
            "kind",
            "phase",
            "caption",
            "created_by",
            "created_by_username",
            "created_at",
        ]
        read_only_fields = fields

    def get_created_by_username(self, obj):
        if obj.created_by:
            full_name = (obj.created_by.get_full_name() or "").strip()
            return full_name or obj.created_by.username
        return "Desconhecido"


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = "__all__"
        read_only_fields = ["id", "uuid", "company", "created_at", "updated_at"]

class SwarmSerializer(serializers.ModelSerializer):
    participant_names = serializers.SerializerMethodField()
    conversation_id = serializers.IntegerField(source="conversation.id", read_only=True)

    class Meta:
        model = Swarm
        fields = ["id", "started_at", "ended_at", "is_active", "conversation_id", "participants", "participant_names"]

    def get_participant_names(self, obj):
        return [u.get_full_name() or u.username for u in obj.participants.all()]


class StageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stage
        fields = "__all__"
        read_only_fields = ["id", "company"]


class SLAPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = SLAPolicy
        fields = "__all__"
        read_only_fields = ["id", "company"]


class CardNestedSerializer(serializers.ModelSerializer):
    contact_name = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    column_id = serializers.SerializerMethodField()
    column_title = serializers.SerializerMethodField()

    class Meta:
        model = Deal
        fields = [
            "id",
            "uuid",
            "title",
            "description",
            "contact",
            "contact_name",
            "owner",
            "owner_name",
            "priority",
            "record_type",
            "value",
            "closing_date",
            "is_closed",
            "external_id",
            "integration_source",
            "data_agendamento",
            "tecnico_responsavel",
            "custom_fields",
            "column",
            "column_id",
            "column_title",
        ]

    def get_contact_name(self, obj):
        return obj.contact.name if obj.contact else "Sem Contato"

    def get_owner_name(self, obj):
        return obj.owner.username if obj.owner else "Sistema"

    def get_column_id(self, obj):
        return obj.column_id if obj.column_id else None

    def get_column_title(self, obj):
        return obj.column.title if obj.column else "Sem Coluna"


class ColumnSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = (
            "id",
            "pipeline",
            "title",
            "order",
            "color",
            "column_kind",
            "value_stream_phase",
            "marks_done",
            "requires_schedule",
            "requires_assignee",
            "allowed_source_columns",
            "wip_limit",
            "legacy_stage",
        )


class ColumnSerializer(serializers.ModelSerializer):
    cards = CardNestedSerializer(many=True, read_only=True)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["cards"].context.update(self.context)

    def validate(self, attrs):
        initial_data = getattr(self, "initial_data", {})
        provided_fields = set(initial_data.keys())
        explicit_boolean_fields = {"marks_done", "requires_schedule", "requires_assignee"} & provided_fields

        if "column_kind" in attrs and not explicit_boolean_fields:
            attrs.update(get_column_semantic_defaults(column_kind=attrs["column_kind"]))
        elif self.instance is None and not explicit_boolean_fields and "column_kind" not in provided_fields:
            attrs.update(get_column_semantic_defaults(title=attrs.get("title")))

        return attrs

    def validate_allowed_source_columns(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Informe uma lista de IDs de colunas permitidas.")

        normalized = []
        for item in value:
            try:
                normalized.append(int(item))
            except (TypeError, ValueError):
                raise serializers.ValidationError("Cada coluna permitida deve ser representada por um ID inteiro.")
        return normalized

    class Meta:
        model = Column
        fields = "__all__"
        read_only_fields = ["id", "company"]


class PipelineSerializer(serializers.ModelSerializer):
    stages = StageSerializer(many=True, read_only=True)
    columns = ColumnSerializer(many=True, read_only=True)

    class Meta:
        model = Pipeline
        fields = "__all__"
        read_only_fields = ["id", "company"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        company = getattr(request, "company", None) if request else None
        if company is not None:
            self.fields["groups"].queryset = CRMGroup.all_objects.filter(company=company)

    def validate(self, attrs):
        visibility = attrs.get("visibility", getattr(self.instance, "visibility", "company"))
        groups = attrs.get("groups")
        if groups is None and self.instance is not None:
            groups = getattr(self.instance, "groups", None).all() if hasattr(self.instance, "groups") else None
        if visibility == "group" and not groups:
            raise serializers.ValidationError({"groups": "Selecione ao menos um grupo para pipelines com visibilidade por grupo."})
        return attrs


class CRMGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = CRMGroup
        fields = ["id", "name", "slug"]
        read_only_fields = ["id"]
        extra_kwargs = {
            "slug": {"required": False, "allow_blank": True},
        }


class CRMSavedViewSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = CRMSavedView
        fields = "__all__"
        read_only_fields = ["id", "company", "owner"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        company = getattr(request, "company", None) if request else None
        if company is not None:
            from .services import get_accessible_pipelines

            self.fields["pipeline"].queryset = get_accessible_pipelines(company=company, user=getattr(request, "user", None))

    def validate_filters(self, value):
        return value if isinstance(value, dict) else {}

    def validate_sorting(self, value):
        return value if isinstance(value, list) else []

    def validate_column_visibility(self, value):
        return value if isinstance(value, dict) else {}


class DealNoteCreateSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=5000, trim_whitespace=True)

    def validate_description(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Escreva uma atualização antes de publicar.")
        return cleaned


class PipelineOverviewSummarySerializer(serializers.Serializer):
    total_deals = serializers.IntegerField()
    total_value = serializers.DecimalField(max_digits=12, decimal_places=2)
    overdue = serializers.IntegerField()
    at_risk = serializers.IntegerField()
    done = serializers.IntegerField()
    average_progress = serializers.IntegerField()


class PipelineOverviewStageSerializer(serializers.Serializer):
    stage_id = serializers.IntegerField(required=False)
    column_id = serializers.IntegerField(required=False)
    column_title = serializers.CharField(required=False)
    name = serializers.CharField()
    total_deals = serializers.IntegerField()
    overdue = serializers.IntegerField()
    average_progress = serializers.IntegerField()


class PipelineOverviewSerializer(serializers.Serializer):
    pipeline_id = serializers.IntegerField()
    pipeline_name = serializers.CharField()
    summary = PipelineOverviewSummarySerializer()
    stages = PipelineOverviewStageSerializer(many=True, required=False)
    columns = PipelineOverviewStageSerializer(many=True, required=False)


class DealSerializer(serializers.ModelSerializer):
    contact_name = serializers.SerializerMethodField()
    stage_name = serializers.CharField(source="stage.name", default="", read_only=True)
    column_id = serializers.SerializerMethodField()
    column_title = serializers.SerializerMethodField()
    column_data = ColumnSummarySerializer(source="column", read_only=True)
    activities = DealActivitySerializer(many=True, read_only=True)
    attachments = DealAttachmentSerializer(many=True, read_only=True)
    messenger_conversation = serializers.IntegerField(source="messenger_conversation_id", read_only=True)
    owner = serializers.PrimaryKeyRelatedField(queryset=User.all_objects.none(), required=False)
    tecnico_responsavel = serializers.PrimaryKeyRelatedField(queryset=User.all_objects.none(), required=False, allow_null=True)
    sla_policy_data = SLAPolicySerializer(source="sla_policy", read_only=True)
    swarm = SwarmSerializer(read_only=True)

    class Meta:
        model = Deal
        fields = [
            "id",
            "uuid",
            "title",
            "description",
            "record_type",
            "contact",
            "contact_name",
            "stage",
            "stage_name",
            "column",
            "column_id",
            "column_title",
            "column_data",
            "value",
            "closing_date",
            "data_agendamento",
            "priority",
            "service_item",
            "affected_cis",
            "change_type",
            "risk_level",
            "change_justification",
            "change_impact",
            "implementation_plan",
            "backout_plan",
            "test_plan",
            "cab_approval",
            "cab_date",
            "root_cause",
            "workaround",
            "resolution_steps",
            "is_known_error",
            "xla_score",
            "ai_metadata",
            "integration_source",
            "external_id",
            "owner",
            "tecnico_responsavel",
            "is_closed",
            "is_deleted",
            "linked_event_id",
            "custom_fields",
            "messenger_conversation",
            "activities",
            "attachments",
            "sla_policy",
            "sla_policy_data",
            "sla_response_deadline",
            "sla_resolution_deadline",
            "first_response_at",
            "sla_status",
            "swarm",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "company", "linked_event_id", "created_at", "updated_at"]

    def get_contact_name(self, obj):
        return obj.contact.name if obj.contact else "Sem Contato"

    def get_column_id(self, obj):
        return obj.column_id if obj.column_id else None

    def get_column_title(self, obj):
        if obj.column:
            return obj.column.title
        if obj.stage:
            return obj.stage.name
        return "Sem Coluna"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.fields["stage"].required = False
        self.fields["column"].required = False

        request = self.context.get("request")
        company = getattr(request, "company", None) if request else None
        if not company and self.instance is not None:
            company = getattr(self.instance, "company", None)

        if company is not None:
            # Usuarios da empresa + Superusuarios (Suporte Global)
            from django.db.models import Q
            global_staff_q = Q(company=company) | Q(is_superuser=True)
            self.fields["owner"].queryset = User.all_objects.filter(global_staff_q)
            self.fields["tecnico_responsavel"].queryset = User.all_objects.filter(global_staff_q)
            from .services import get_accessible_pipelines

            allowed_pipelines = get_accessible_pipelines(company=company, user=getattr(request, "user", None))
            self.fields["stage"].queryset = Stage.all_objects.filter(company=company, pipeline__in=allowed_pipelines)
            self.fields["column"].queryset = Column.all_objects.filter(company=company, pipeline__in=allowed_pipelines)

        if not should_include_legacy_stage_fields(self.context) and not hasattr(self, "initial_data"):
            self.fields.pop("stage", None)

    def validate(self, attrs):
        legacy_stage = attrs.get("stage")
        column = attrs.get("column")
        instance = getattr(self, "instance", None)

        if column is None and legacy_stage is not None:
            column = getattr(legacy_stage, "column", None)
            if column is not None:
                attrs["column"] = column

        if legacy_stage is None and column is not None:
            # Recuperação crítica: garante que o deal tenha um Stage legado associado (exigido pelo DB)
            legacy_stage = getattr(column, "legacy_stage", None)
            if legacy_stage is None:
                # Tenta encontrar um Stage com o mesmo nome na pipeline ou cria um novo para manter a integridade
                from .models import Stage
                try:
                    # Usamos all_objects para garantir que não sejamos limitados por filtros de tenant se o contexto estiver instável
                    legacy_stage = Stage.all_objects.filter(pipeline=column.pipeline, name=column.title).first()
                    if not legacy_stage:
                        # Recuperamos o contexto de forma segura
                        request = self.context.get("request")
                        target_company = getattr(request, "company", None) if request else None
                        
                        # Fallback robusto para empresa
                        if not target_company:
                            if column and hasattr(column, "company"):
                                target_company = column.company
                            elif instance and hasattr(instance, "company"):
                                target_company = instance.company
                            elif instance and hasattr(instance, "contact") and instance.contact:
                                target_company = instance.contact.company
                        
                        if not target_company:
                            logger.error(f"Não foi possível determinar a empresa para criar Stage na coluna {column.id}")
                            raise serializers.ValidationError({"column": "Erro de integridade: empresa não identificada para o estágio."})

                        legacy_stage = Stage.objects.create(
                            company=target_company,
                            pipeline=column.pipeline,
                            name=column.title,
                            order=column.order
                        )
                    
                    # Vincula de volta à coluna para futuras referências (apenas se mudou)
                    if column.legacy_stage_id != legacy_stage.id:
                        column.legacy_stage = legacy_stage
                        column.save(update_fields=["legacy_stage"])
                        
                except Exception as e:
                    logger.exception(f"Falha crítica na sincronização de legacy_stage para coluna {column.id}: {e}")
                    # Se falhar aqui, não podemos prosseguir pois o Deal exige um Stage no banco
                    raise serializers.ValidationError({"column": f"Erro interno de sincronização de estágio: {str(e)}"})
            
            attrs["stage"] = legacy_stage

        if instance is not None:
            instance_legacy_stage = instance.stage
            attrs.setdefault("stage", instance_legacy_stage)
            attrs.setdefault("column", instance.column or getattr(instance_legacy_stage, "column", None))

        target_column = attrs.get("column")
        if target_column is not None:
            current_column = None
            if instance is not None:
                current_column = instance.column or getattr(instance.stage, "column", None)

            source_column_id = getattr(current_column, "id", None)
            target_column_id = getattr(target_column, "id", None)
            is_column_change = source_column_id != target_column_id

            if is_column_change and not target_column.allows_transition_from(source_column_id):
                raise serializers.ValidationError(
                    {
                        "column": (
                            f"O card nao pode ser movido de '{current_column.title if current_column else 'sem coluna'}' "
                            f"para '{target_column.title}'."
                        )
                    }
                )

            if is_column_change and target_column.wip_limit:
                occupancy = Deal.all_objects.filter(
                    company=target_column.company,
                    column=target_column,
                    is_deleted=False,
                )
                if instance is not None:
                    occupancy = occupancy.exclude(id=instance.id)
                if occupancy.count() >= target_column.wip_limit:
                    raise serializers.ValidationError(
                        {
                            "column": (
                                f"A coluna '{target_column.title}' atingiu o limite WIP de {target_column.wip_limit} cards."
                            )
                        }
                    )

            data_agendamento = attrs.get("data_agendamento", getattr(instance, "data_agendamento", None))
            tecnico_responsavel = attrs.get("tecnico_responsavel", getattr(instance, "tecnico_responsavel", None))

            errors = {}
            if target_column.requires_schedule and not data_agendamento:
                errors["data_agendamento"] = "Preencha a data de agendamento para mover o card para uma coluna com agendamento obrigatório."
            if target_column.requires_assignee and not tecnico_responsavel:
                errors["tecnico_responsavel"] = "Defina o técnico responsável para mover o card para uma coluna com responsável obrigatório."
            if errors:
                raise serializers.ValidationError(errors)

        return attrs


class IntegrationSyncCardSerializer(serializers.Serializer):
    pipeline_id = serializers.IntegerField()
    column_id = serializers.IntegerField(required=False, allow_null=True)
    external_id = serializers.CharField(max_length=255)
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    integration_source = serializers.CharField(max_length=50, default="glpi")
    value = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default="0.00")
    priority = serializers.ChoiceField(choices=Deal.PRIORITY_CHOICES, required=False, default="MEDIUM")
    record_type = serializers.ChoiceField(choices=Deal.RECORD_TYPE_CHOICES, required=False, default="incident")
    closing_date = serializers.DateTimeField(required=False, allow_null=True)
    data_agendamento = serializers.DateTimeField(required=False, allow_null=True)
    owner_id = serializers.IntegerField(required=False, allow_null=True)
    tecnico_responsavel_id = serializers.IntegerField(required=False, allow_null=True)
    contact_id = serializers.IntegerField(required=False, allow_null=True)
    custom_fields = serializers.JSONField(required=False)

    def validate(self, attrs):
        request = self.context.get("request")
        company = getattr(request, "company", None) if request else None

        pipeline = Pipeline.all_objects.filter(company=company, id=attrs["pipeline_id"]).first()
        if pipeline is None:
            raise serializers.ValidationError({"pipeline_id": "Pipeline inválido para este tenant."})
        attrs["pipeline"] = pipeline

        column_id = attrs.get("column_id")
        if column_id is not None:
            column = Column.all_objects.filter(company=company, pipeline=pipeline, id=column_id).first()
            if column is None:
                raise serializers.ValidationError({"column_id": "Coluna inválida para este pipeline."})
            attrs["column"] = column

        owner_id = attrs.get("owner_id")
        tecnico_id = attrs.get("tecnico_responsavel_id")
        contact_id = attrs.get("contact_id")

        if owner_id is not None:
            owner = User.all_objects.filter(company=company, id=owner_id).first()
            if owner is None:
                raise serializers.ValidationError({"owner_id": "Responsável inválido para este tenant."})
            attrs["owner"] = owner

        if tecnico_id is not None:
            tecnico = User.all_objects.filter(company=company, id=tecnico_id).first()
            if tecnico is None:
                raise serializers.ValidationError({"tecnico_responsavel_id": "Técnico inválido para este tenant."})
            attrs["tecnico_responsavel"] = tecnico

        if contact_id is not None:
            contact = Contact.all_objects.filter(company=company, id=contact_id).first()
            if contact is None:
                raise serializers.ValidationError({"contact_id": "Contato inválido para este tenant."})
            attrs["contact"] = contact

        return attrs


class IntegrationGLPITicketWebhookSerializer(serializers.Serializer):
    ticket = serializers.DictField(required=False)

    ticket_id = serializers.CharField(max_length=255, required=False)
    external_id = serializers.CharField(max_length=255, required=False)

    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    priority = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    priority_level = serializers.IntegerField(required=False, allow_null=True)

    requester = serializers.DictField(required=False)
    custom_fields = serializers.JSONField(required=False)

    pipeline_id = serializers.IntegerField(required=False, allow_null=True)
    column_id = serializers.IntegerField(required=False, allow_null=True)
    owner_id = serializers.IntegerField(required=False, allow_null=True)
    tecnico_responsavel_id = serializers.IntegerField(required=False, allow_null=True)
    contact_id = serializers.IntegerField(required=False, allow_null=True)

    def _normalize_priority(self, raw_priority, raw_level):
        if isinstance(raw_priority, str) and raw_priority.upper() in {"LOW", "MEDIUM", "HIGH", "URGENT"}:
            return raw_priority.upper()
        if raw_level is None:
            return "MEDIUM"
        try:
            level = int(raw_level)
        except (TypeError, ValueError):
            return "MEDIUM"
        if level <= 2:
            return "LOW"
        if level == 3:
            return "MEDIUM"
        if level == 4:
            return "HIGH"
        return "URGENT"

    def validate(self, attrs):
        ticket = attrs.get("ticket") or {}

        ticket_id = attrs.get("ticket_id") or ticket.get("id") or ticket.get("ticket_id")
        if ticket_id in (None, ""):
            raise serializers.ValidationError({"ticket_id": "Informe o ID do chamado (ticket_id)."})

        title = attrs.get("title") or ticket.get("name") or ticket.get("title") or ""
        if not str(title).strip():
            raise serializers.ValidationError({"title": "Informe o título do chamado (title)."})

        description = attrs.get("description")
        if description is None:
            description = ticket.get("content") or ticket.get("description")

        raw_priority = attrs.get("priority") or ticket.get("priority")
        raw_level = attrs.get("priority_level") or ticket.get("urgency") or ticket.get("priority_level")

        attrs["ticket_id"] = str(ticket_id)
        attrs["external_id"] = attrs.get("external_id") or f"glpi:{attrs['ticket_id']}"
        attrs["title"] = str(title).strip()
        attrs["description"] = description
        attrs["integration_source"] = "glpi"
        attrs["priority"] = self._normalize_priority(raw_priority, raw_level)

        requester = attrs.get("requester") or ticket.get("requester") or {}
        if requester and isinstance(requester, dict):
            attrs["requester"] = requester

        custom_fields = attrs.get("custom_fields")
        if not isinstance(custom_fields, dict):
            custom_fields = {}
        if ticket and isinstance(ticket, dict):
            custom_fields.setdefault("glpi", {})
            if isinstance(custom_fields["glpi"], dict):
                for k in ("url", "status", "category", "type", "itilcategories_id"):
                    if k in ticket and k not in custom_fields["glpi"]:
                        custom_fields["glpi"][k] = ticket.get(k)
        if requester and isinstance(requester, dict):
            custom_fields.setdefault("requester", requester)
        attrs["custom_fields"] = custom_fields

        # Mapeamento ITIL Version 5 (Type GLPI -> record_type)
        glpi_type = ticket.get("type")
        if glpi_type == 1:  # Incident
            attrs["record_type"] = "incident"
        elif glpi_type == 2:  # Request
            attrs["record_type"] = "service_request"

        return attrs


class CRMIntegrationPipelineOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pipeline
        fields = ["id", "name"]


class CRMIntegrationColumnOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Column
        fields = ["id", "pipeline", "title", "order", "marks_done"]


class CRMIntegrationUserOptionSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "display_name"]

    def get_display_name(self, obj):
        full_name = (obj.get_full_name() or "").strip()
        return full_name or obj.username

    def get_progress_percentage(self, obj):
        return 0




class CRMIntegrationContactOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ["id", "name", "email"]


class CRMIntegrationInboundEventSerializer(serializers.ModelSerializer):
    processed_deal_id = serializers.IntegerField(source="processed_deal.id", read_only=True)
    processed_deal_title = serializers.CharField(source="processed_deal.title", read_only=True)
    replayed_from_id = serializers.IntegerField(source="replayed_from.id", read_only=True)

    class Meta:
        model = IntegrationInboundEvent
        fields = [
            "id",
            "source",
            "event_type",
            "external_id",
            "status",
            "response_status_code",
            "error",
            "replayed_from_id",
            "processed_deal_id",
            "processed_deal_title",
            "created_at",
        ]


class EvolutionConfigSerializer(serializers.ModelSerializer):
    webhook_url = serializers.SerializerMethodField()
    api_token = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = EvolutionConfig
        fields = [
            "id",
            "instance_name",
            "api_url",
            "api_token",
            "is_active",
            "webhook_token",
            "webhook_url",
            "default_pipeline",
            "default_column",
        ]
        read_only_fields = ["webhook_token", "webhook_url"]

    def get_webhook_url(self, obj):
        request = self.context.get("request")
        path = f"/api/crm/integrations/evolution/{obj.webhook_token}/"
        if request:
            return request.build_absolute_uri(path)
        return path

class XLAFeedbackSerializer(serializers.ModelSerializer):
    contact_name = serializers.ReadOnlyField(source="contact.name")
    
    class Meta:
        model = XLAFeedback
        fields = [
            "id", "deal", "contact", "contact_name", "rating", "comment",
            "ease_of_use", "speed_satisfaction", "outcome_satisfaction", "created_at"
        ]

class CSIEntrySerializer(serializers.ModelSerializer):
    requester_name = serializers.ReadOnlyField(source="requester.get_full_name")
    responsible_name = serializers.ReadOnlyField(source="responsible.get_full_name")
    deal_title = serializers.ReadOnlyField(source="deal.title")
    pipeline_title = serializers.ReadOnlyField(source="pipeline.title")

    class Meta:
        model = CSIEntry
        fields = [
            "id", "title", "description", "priority", "status",
            "deal", "deal_title", "pipeline", "pipeline_title",
            "proposed_solution", "expected_outcome",
            "requester", "requester_name", "responsible", "responsible_name",
            "created_at", "updated_at"
        ]
        read_only_fields = ["requester"]

    def create(self, validated_data):
        validated_data['requester'] = self.context['request'].user
        return super().create(validated_data)
