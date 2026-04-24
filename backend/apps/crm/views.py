import hashlib
import hmac
import logging
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q, Sum
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone
from rest_framework import parsers, permissions, status, viewsets
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from io import BytesIO
from django.http import HttpResponse
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

try:
    from rest_framework_simplejwt.authentication import JWTAuthentication
except Exception:
    JWTAuthentication = None

from apps.accounts.permissions import ActionRolePermission, HasRolePermission
from apps.api_keys.authentication import APIKeyAuthentication
from apps.api_keys.models import APIKey
from apps.api_keys.permissions import HasAPIKeyScopes
from apps.media.models import Media
from apps.messenger.models import Conversation, Message
from apps.module_manager.models import TenantModule
from apps.module_manager.permissions import HasModuleAccess
from apps.notifications.models import Notification

from .integration_sync import upsert_integration_card
from .models import (
    Column,
    Contact,
    CRMGroup,
    CRMSavedView,
    Deal,
    DealActivity,
    DealAttachment,
    IntegrationInboundEvent,
    IntegrationInboundStatus,
    Pipeline,
    SLAPolicy,
    Stage,
    XLAFeedback,
    CSIEntry,
    get_column_semantic_defaults,
)
from .serializers import (
    ColumnSerializer,
    ContactSerializer,
    CRMGroupSerializer,
    CRMIntegrationColumnOptionSerializer,
    CRMIntegrationContactOptionSerializer,
    CRMIntegrationInboundEventSerializer,
    CRMIntegrationPipelineOptionSerializer,
    CRMIntegrationUserOptionSerializer,
    CRMSavedViewSerializer,
    DealNoteCreateSerializer,
    DealSerializer,
    EvolutionConfigSerializer,
    IntegrationGLPITicketWebhookSerializer,
    IntegrationSyncCardSerializer,
    PipelineOverviewSerializer,
    PipelineSerializer,
    SLAPolicySerializer,
    XLAFeedbackSerializer,
    CSIEntrySerializer,
    should_include_legacy_overview_stages,
    should_include_legacy_stage_fields,
)
from .services import get_accessible_pipelines, get_crm_integration_config, send_column_change_webhook

logger = logging.getLogger(__name__)
User = get_user_model()


def add_deprecation_headers(response, message):
    response["Warning"] = f'299 atlas "{message}"'
    response["X-Atlas-Deprecated"] = "true"
    response["X-Atlas-Deprecation-Message"] = message
    return response


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    required_permission = "crm.deal_view"
    action_permissions = {
        "list": "crm.deal_view",
        "retrieve": "crm.deal_view",
        "create": "crm.contact_manage",
        "update": "crm.contact_manage",
        "partial_update": "crm.contact_manage",
        "destroy": "crm.contact_manage",
    }

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return Contact.all_objects.none()
        return Contact.all_objects.filter(company=company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)


class SLAPolicyViewSet(viewsets.ModelViewSet):
    serializer_class = SLAPolicySerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    required_permission = "crm.deal_view"
    action_permissions = {
        "list": "crm.deal_view",
        "retrieve": "crm.deal_view",
        "create": "crm.column_manage",
        "update": "crm.column_manage",
        "partial_update": "crm.column_manage",
        "destroy": "crm.column_manage",
    }

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return SLAPolicy.all_objects.none()
        return SLAPolicy.all_objects.filter(company=company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)


class CRMSavedViewViewSet(viewsets.ModelViewSet):
    serializer_class = CRMSavedViewSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    pagination_class = None
    required_permission = "crm.saved_view_manage"
    action_permissions = {
        "list": "crm.saved_view_manage",
        "retrieve": "crm.saved_view_manage",
        "create": "crm.saved_view_manage",
        "update": "crm.saved_view_manage",
        "partial_update": "crm.saved_view_manage",
        "destroy": "crm.saved_view_manage",
    }

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        user = getattr(self.request, "user", None)
        if not company or not getattr(user, "is_authenticated", False):
            return CRMSavedView.all_objects.none()

        queryset = CRMSavedView.all_objects.select_related("pipeline", "owner").filter(company=company, owner=user)
        pipeline_id = self.request.query_params.get("pipeline_id")
        if pipeline_id:
            queryset = queryset.filter(pipeline_id=pipeline_id)
        return queryset

    def _unset_other_defaults(self, saved_view):
        if not saved_view.is_default:
            return

        CRMSavedView.all_objects.filter(
            company=saved_view.company,
            owner=saved_view.owner,
            pipeline=saved_view.pipeline,
            is_default=True,
        ).exclude(id=saved_view.id).update(is_default=False)

    def perform_create(self, serializer):
        saved_view = serializer.save(company=self.request.company, owner=self.request.user)
        self._unset_other_defaults(saved_view)

    def perform_update(self, serializer):
        saved_view = serializer.save()
        self._unset_other_defaults(saved_view)


class CRMGroupViewSet(viewsets.ModelViewSet):
    serializer_class = CRMGroupSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    required_permission = "crm.deal_view"
    action_permissions = {
        "list": "crm.deal_view",
        "retrieve": "crm.deal_view",
        "create": "crm.pipeline_manage",
        "update": "crm.pipeline_manage",
        "partial_update": "crm.pipeline_manage",
        "destroy": "crm.pipeline_manage",
    }

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return CRMGroup.all_objects.none()
        return CRMGroup.all_objects.filter(company=company).order_by("name", "id")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)


class PipelineViewSet(viewsets.ModelViewSet):
    serializer_class = PipelineSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    required_permission = "crm.deal_view"
    action_permissions = {
        "list": "crm.deal_view",
        "retrieve": "crm.deal_view",
        "create": "crm.pipeline_manage",
        "update": "crm.pipeline_manage",
        "partial_update": "crm.pipeline_manage",
        "destroy": "crm.pipeline_manage",
        "overview": "crm.deal_view",
    }

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return Pipeline.all_objects.none()
        return get_accessible_pipelines(company=company, user=getattr(self.request, "user", None))

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)

    @action(detail=True, methods=["post"])
    def apply_itil_template(self, request, pk=None):
        pipeline = self.get_object()
        from .models import Column
        
        # Estágios Estratégicos ITIL Version 5
        itil_columns = [
            {"title": "📥 Demanda / Backlog", "column_kind": "backlog", "vsp": "demand", "order": 10},
            {"title": "🔍 Descoberta & Design", "column_kind": "discover", "vsp": "product_design", "order": 20},
            {"title": "🛠️ Aquisição & Construção", "column_kind": "build", "vsp": "creation", "order": 30},
            {"title": "🚀 Transição & Homologação", "column_kind": "transition", "vsp": "onboarding", "order": 40},
            {"title": "💎 Entrega & Suporte", "column_kind": "support", "vsp": "realization", "order": 50},
            {"title": "✅ Valor Realizado", "column_kind": "done", "vsp": "realization", "order": 60, "marks_done": True},
        ]
        
        created_count = 0
        for col_data in itil_columns:
            if not Column.objects.filter(pipeline=pipeline, title=col_data["title"]).exists():
                column = Column.objects.create(
                    pipeline=pipeline,
                    company=pipeline.company,
                    title=col_data["title"],
                    column_kind=col_data["column_kind"],
                    value_stream_phase=col_data["vsp"],
                    order=col_data["order"],
                    marks_done=col_data.get("marks_done", False)
                )
                # ITIL Version 5: Garantir que o esquema legado (Stage) acompanhe o novo (Column)
                legacy_stage = Stage.objects.create(
                    company=pipeline.company,
                    pipeline=pipeline,
                    name=col_data["title"],
                    order=col_data["order"]
                )
                column.legacy_stage = legacy_stage
                column.save(update_fields=["legacy_stage"])
                created_count += 1
                
        return Response({
            "status": "success", 
            "message": f"Template ITIL v5 aplicado. {created_count} novas colunas criadas.",
            "created_columns": created_count
        })

    @staticmethod
    def _get_progress_value(deal):
        raw_value = (deal.custom_fields or {}).get("progress_percentage")

        try:
            numeric_value = float(raw_value)
        except (TypeError, ValueError):
            return 0

        return max(0, min(100, round(numeric_value)))

    @staticmethod
    def _get_deadline_risk(deal):
        if not deal.closing_date:
            return "none"

        current_column = deal.column or getattr(deal.stage, "column", None)
        if deal.is_closed or (current_column and current_column.is_done()):
            return "done"

        now = timezone.localtime(timezone.now())
        due_date = timezone.localtime(deal.closing_date)
        start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start_of_due = due_date.replace(hour=0, minute=0, second=0, microsecond=0)
        diff_in_days = (start_of_due - start_of_today).days

        if diff_in_days < 0:
            return "overdue"
        if diff_in_days <= 2:
            return "risk"
        return "ok"

    @action(detail=True, methods=["get"])
    def overview(self, request, pk=None):
        pipeline = self.get_object()
        columns = list(pipeline.columns.all().order_by("order", "id"))
        if not columns:
            columns = [
                Column.objects.create(
                    company=pipeline.company,
                    pipeline=pipeline,
                    title=legacy_stage.name,
                    order=legacy_stage.order,
                    **get_column_semantic_defaults(title=legacy_stage.name),
                    legacy_stage=legacy_stage,
                )
                for legacy_stage in pipeline.stages.all().order_by("order", "id")
            ]
        deals = list(
            Deal.all_objects.select_related("stage", "column")
            .filter(company=request.company, is_deleted=False, stage__pipeline=pipeline)
        )

        summary = {
            "total_deals": 0,
            "total_value": Decimal("0.00"),
            "overdue": 0,
            "at_risk": 0,
            "done": 0,
            "average_progress": 0,
        }
        progress_sum = 0
        stages_payload = []

        for column in columns:
            stage_deals = [deal for deal in deals if deal.column_id == column.id or (deal.column_id is None and deal.stage_id == column.legacy_stage_id)]
            stage_progress_sum = 0
            stage_overdue = 0

            for deal in stage_deals:
                progress = self._get_progress_value(deal)
                risk = self._get_deadline_risk(deal)

                summary["total_deals"] += 1
                summary["total_value"] += deal.value or Decimal("0.00")
                progress_sum += progress
                stage_progress_sum += progress

                if risk == "overdue":
                    summary["overdue"] += 1
                    stage_overdue += 1
                if risk == "risk":
                    summary["at_risk"] += 1
                if deal.is_closed or column.is_done() or progress >= 100:
                    summary["done"] += 1

            stages_payload.append(
                {
                    "stage_id": column.legacy_stage_id,
                    "column_id": column.id,
                    "column_title": column.title,
                    "name": column.title,
                    "total_deals": len(stage_deals),
                    "overdue": stage_overdue,
                    "average_progress": round(stage_progress_sum / len(stage_deals)) if stage_deals else 0,
                }
            )

        if summary["total_deals"] > 0:
            summary["average_progress"] = round(progress_sum / summary["total_deals"])

        serializer_payload = {
            "pipeline_id": pipeline.id,
            "pipeline_name": pipeline.name,
            "summary": summary,
            "columns": stages_payload,
        }

        if should_include_legacy_overview_stages({"request": request}):
            serializer_payload["stages"] = stages_payload

        serializer = PipelineOverviewSerializer(serializer_payload)
        response = Response(serializer.data)
        if should_include_legacy_overview_stages({"request": request}):
            return add_deprecation_headers(
                response,
                "crm overview field 'stages' is deprecated; prefer 'columns'.",
            )
        return response


class ColumnViewSet(viewsets.ModelViewSet):
    serializer_class = ColumnSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    required_permission = "crm.deal_view"
    action_permissions = {
        "list": "crm.deal_view",
        "retrieve": "crm.deal_view",
        "create": "crm.column_manage",
        "update": "crm.column_manage",
        "partial_update": "crm.column_manage",
        "destroy": "crm.column_manage",
    }

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return Column.all_objects.none()
        allowed_pipelines = get_accessible_pipelines(company=company, user=getattr(self.request, "user", None))
        return (
            Column.all_objects.select_related("pipeline", "legacy_stage")
            .prefetch_related("cards")
            .filter(company=company, pipeline__in=allowed_pipelines)
        )

    def perform_create(self, serializer):
        column = serializer.save(company=self.request.company)
        if column.legacy_stage_id is None:
            # Garante persistência da compatibilidade com o esquema legado de Deals (ForeignKey para Stage)
            try:
                legacy_stage = Stage.objects.create(
                    company=self.request.company,
                    pipeline=column.pipeline,
                    name=column.title,
                    order=column.order,
                )
                column.legacy_stage = legacy_stage
                column.save(update_fields=["legacy_stage"])
            except Exception as e:
                logger.error(f"Erro ao criar legacy_stage para coluna {column.id}: {e}")
                # Não falhamos a criação da coluna, mas registramos o erro

    def perform_update(self, serializer):
        column = serializer.save()
        if column.legacy_stage_id:
            Stage.all_objects.filter(id=column.legacy_stage_id).update(
                pipeline=column.pipeline,
                name=column.title,
                order=column.order,
            )


class DealViewSet(viewsets.ModelViewSet):
    serializer_class = DealSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "crm"
    pagination_class = None
    required_permission = "crm.deal_view"
    action_permissions = {
        "list": "crm.deal_view",
        "retrieve": "crm.deal_view",
        "create": "crm.deal_edit",
        "update": "crm.deal_edit",
        "partial_update": "crm.deal_edit",
        "destroy": "crm.deal_delete",
        "add_note": "crm.deal_comment",
        "attachments": "crm.deal_attach",
        "delete_attachment": "crm.deal_attach_delete",
        "topology": "crm.deal_view",
    }

    @staticmethod
    def _is_done_column(legacy_stage=None, column=None):
        resolved_column = column or getattr(legacy_stage, "column", None)
        return bool(resolved_column and resolved_column.is_done())

    def perform_create(self, serializer):
        legacy_stage = serializer.validated_data.get("stage")
        column = serializer.validated_data.get("column") or getattr(legacy_stage, "column", None)
        serializer.save(
            owner=serializer.validated_data.get("owner", self.request.user),
            company=self.request.company,
            tecnico_responsavel=serializer.validated_data.get("tecnico_responsavel"),
            record_type=serializer.validated_data.get("record_type", "incident"),
            column=column,
            is_closed=self._is_done_column(legacy_stage=legacy_stage, column=column),
        )

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return Deal.all_objects.none()

        allowed_pipelines = get_accessible_pipelines(company=company, user=getattr(self.request, "user", None))
        qs = (
            Deal.all_objects.select_related("stage", "column", "contact", "owner", "tecnico_responsavel")
            .prefetch_related("activities", "activities__actor", "attachments", "attachments__media", "attachments__created_by")
            .filter(company=company, is_deleted=False)
        )
        qs = qs.filter(Q(column__pipeline__in=allowed_pipelines) | Q(stage__pipeline__in=allowed_pipelines))
        pipeline_id = self.request.query_params.get("pipeline_id")
        if pipeline_id:
            qs = qs.filter(Q(column__pipeline_id=pipeline_id) | Q(stage__pipeline_id=pipeline_id))

        record_type = self.request.query_params.get("record_type")
        if record_type:
            qs = qs.filter(record_type=record_type)

        sla_status = self.request.query_params.get("sla_status")
        if sla_status:
            qs = qs.filter(sla_status=sla_status)

        return qs

    def _ensure_media_module_enabled(self, request):
        if getattr(request.user, "is_superuser", False):
            return True
        company = getattr(request, "company", None)
        if not company:
            return False
        return TenantModule.all_objects.filter(company=company, module__code="media", is_active=True).exists()

    def _ensure_messenger_module_enabled(self, request):
        if getattr(request.user, "is_superuser", False):
            return True
        company = getattr(request, "company", None)
        if not company:
            return False
        return TenantModule.all_objects.filter(company=company, module__code="messenger", is_active=True).exists()

    @staticmethod
    def _extract_mentions(text: str):
        import re

        if not text:
            return []
        matches = re.findall(r"@([a-zA-Z0-9._-]{2,50})", text)
        normalized = []
        seen = set()
        for m in matches:
            key = m.lower()
            if key in seen:
                continue
            seen.add(key)
            normalized.append(m)
        return normalized

    def _user_has_permission(self, user, permission_slug: str):
        if not user or not getattr(user, "is_authenticated", False):
            return False
        if getattr(user, "is_superuser", False):
            return True
        role = getattr(user, "role", None)
        perms = getattr(role, "permissions", None) if role else None
        if not isinstance(perms, list):
            return False
        if "*" in perms:
            return True
        return permission_slug in perms

    def _ensure_deal_conversation(self, request, deal, participants):
        if not self._ensure_messenger_module_enabled(request):
            return None
        if not self._user_has_permission(request.user, "messenger.view"):
            return None

        if deal.messenger_conversation_id:
            conversation = Conversation.all_objects.filter(company=deal.company, id=deal.messenger_conversation_id).first()
            if conversation:
                return conversation

        conversation = Conversation.objects.create(
            company=deal.company,
            title=f"CRM • {deal.title}",
            is_group=True,
        )
        conversation.participants.set(participants)
        deal.messenger_conversation = conversation
        deal.save(update_fields=["messenger_conversation"])
        return conversation

    @action(detail=True, methods=["get", "post"], url_path="attachments", parser_classes=[parsers.MultiPartParser, parsers.FormParser])
    def attachments(self, request, pk=None):
        deal = self.get_object()
        if not self._ensure_media_module_enabled(request):
            return Response({"detail": "O módulo de mídia precisa estar ativo para anexar arquivos."}, status=status.HTTP_403_FORBIDDEN)

        if request.method.lower() == "get":
            return Response(DealSerializer(deal, context={"request": request}).data)

        uploaded_file = request.FILES.get("file")
        media_id = request.data.get("media_id")
        kind = request.data.get("kind") or "photo"
        phase = request.data.get("phase") or "during"
        caption = (request.data.get("caption") or "").strip()

        if uploaded_file is None and not media_id:
            return Response({"detail": "Envie um arquivo (file) ou informe media_id."}, status=status.HTTP_400_BAD_REQUEST)

        if phase not in {"before", "during", "after"}:
            return Response({"detail": "Fase inválida. Use before, during ou after."}, status=status.HTTP_400_BAD_REQUEST)

        if len(caption) > 255:
            return Response({"detail": "Legenda muito longa (máximo 255 caracteres)."}, status=status.HTTP_400_BAD_REQUEST)

        if uploaded_file is not None:
            media = Media.objects.create(
                company=deal.company,
                file=uploaded_file,
                title=request.data.get("title") or getattr(uploaded_file, "name", ""),
                alt_text=request.data.get("alt_text") or "",
                file_type=getattr(uploaded_file, "content_type", "") or "",
                file_size=getattr(uploaded_file, "size", 0) or 0,
            )
        else:
            try:
                media = Media.all_objects.get(company=deal.company, id=media_id)
            except Media.DoesNotExist:
                return Response({"detail": "Mídia não encontrada para esta empresa."}, status=status.HTTP_404_NOT_FOUND)

        actor = request.user if getattr(request.user, "is_authenticated", False) else deal.owner
        attachment = DealAttachment.objects.create(
            company=deal.company,
            deal=deal,
            media=media,
            kind=kind if kind in {"photo", "file"} else "photo",
            phase=phase,
            caption=caption,
            created_by=actor,
        )
        DealActivity.objects.create(
            company=deal.company,
            deal=deal,
            actor=actor,
            activity_type="automation",
            description=f"Anexo adicionado ({attachment.get_phase_display()}): {media.title}",
            new_value={
                "attachment_id": str(attachment.id),
                "media_id": str(media.id),
                "kind": attachment.kind,
                "phase": attachment.phase,
                "caption": attachment.caption,
            },
        )
        deal.refresh_from_db()
        return Response(DealSerializer(deal, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"attachments/(?P<attachment_id>[^/.]+)")
    def delete_attachment(self, request, pk=None, attachment_id=None):
        from django.core.exceptions import ValidationError

        deal = self.get_object()
        if not self._ensure_media_module_enabled(request):
            return Response({"detail": "O módulo de mídia precisa estar ativo para anexar arquivos."}, status=status.HTTP_403_FORBIDDEN)
        try:
            attachment = DealAttachment.all_objects.get(company=deal.company, deal=deal, id=attachment_id)
        except ValidationError:
            return Response({"detail": "ID do anexo inválido."}, status=status.HTTP_400_BAD_REQUEST)
        except DealAttachment.DoesNotExist:
            return Response({"detail": "Anexo não encontrado."}, status=status.HTTP_404_NOT_FOUND)
        actor = request.user if getattr(request.user, "is_authenticated", False) else deal.owner
        DealActivity.objects.create(
            company=deal.company,
            deal=deal,
            actor=actor,
            activity_type="automation",
            description=f"Anexo removido ({attachment.get_phase_display()}): {attachment.media.title}",
            old_value={
                "attachment_id": str(attachment.id),
                "media_id": str(attachment.media_id),
                "kind": attachment.kind,
                "phase": attachment.phase,
                "caption": attachment.caption,
            },
        )
        attachment.delete()
        deal.refresh_from_db()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def topology(self, request, pk=None):
        """
        ITIL Version 5: Visualização 360 graus do ecossistema do Deal.
        Retorna nós e links para visualização em grafo (Topology tab).
        """
        deal = self.get_object()
        
        nodes = []
        links = []
        
        # Central Node (O Deal)
        nodes.append({
            "id": f"deal_{deal.id}",
            "type": "deal",
            "label": f"[{deal.record_type.upper()}] {deal.title}",
            "priority": deal.priority,
            "status": "closed" if deal.is_closed else "active",
            "uuid": str(deal.uuid)
        })
        
        # ICs Afetados (Affected CIs)
        if hasattr(deal, 'affected_cis'):
            for ci in deal.affected_cis.all():
                nodes.append({
                    "id": f"ci_{ci.id}",
                    "type": "ci",
                    "kind": ci.ci_type.name if ci.ci_type else "General",
                    "label": ci.name,
                    "status": ci.status,
                    "asset_tag": ci.asset_tag
                })
                links.append({
                    "source": f"deal_{deal.id}",
                    "target": f"ci_{ci.id}",
                    "relation": "impacts",
                    "label": "Afeta IC"
                })
            
        # Usuários Relacionados (Participantes do Swarm se houver)
        if hasattr(deal, 'swarm') and deal.swarm:
            for user in deal.swarm.participants.all():
                nodes.append({
                    "id": f"user_{user.id}",
                    "type": "user",
                    "label": user.get_full_name() or user.username,
                    "email": user.email
                })
                links.append({
                    "source": f"deal_{deal.id}",
                    "target": f"user_{user.id}",
                    "relation": "collaborator",
                    "label": "Swarmer"
                })
        
        # Dono e Técnico Responsável
        if deal.owner:
             nodes.append({
                "id": f"user_{deal.owner.id}",
                "type": "user",
                "label": deal.owner.get_full_name() or deal.owner.username,
                "email": deal.owner.email,
                "role": "Owner"
            })
             links.append({
                "source": f"deal_{deal.id}",
                "target": f"user_{deal.owner.id}",
                "relation": "owner",
                "label": "Responsável"
            })
            
        # RFCs/Problemas Vinculados (via ai_metadata)
        metadata = deal.ai_metadata or {}
        if metadata.get('linked_rfc_id'):
            rfc_id = metadata['linked_rfc_id']
            nodes.append({
                "id": f"deal_{rfc_id}",
                "type": "deal",
                "label": f"RFC #{rfc_id} (Automática)",
                "kind": "change",
                "status": "triggered"
            })
            links.append({
                "source": f"deal_{deal.id}",
                "target": f"deal_{rfc_id}",
                "relation": "triggers",
                "label": "Gatilhou Mudança"
            })
            
        return Response({"nodes": nodes, "links": links})

    @action(detail=True, methods=["post"])
    def start_swarm(self, request, pk=None):
        deal = self.get_object()
        if hasattr(deal, 'swarm') and deal.swarm.is_active:
             return Response(DealSerializer(deal, context={"request": request}).data)
            
        participants = set()
        if deal.owner: participants.add(deal.owner)
        if deal.tecnico_responsavel: participants.add(deal.tecnico_responsavel)
        participants.add(request.user)
        
        from apps.messenger.services import MessengerService
        from .models import Swarm
        
        conversation = MessengerService.create_conversation(
            creator=request.user,
            company=deal.company,
            participant_usernames=[p.username for p in participants],
            title=f"🚨 SWARM: {deal.title}",
            is_group=True
        )
        
        swarm, created = Swarm.objects.get_or_create(
            deal=deal,
            company=deal.company,
            defaults={
                "conversation": conversation,
                "is_active": True
            }
        )
        if not created:
            swarm.is_active = True
            swarm.conversation = conversation
            swarm.save()
        
        swarm.participants.set(list(participants))
        
        MessengerService.send_message(
            user=request.user,
            company=deal.company,
            conversation=conversation,
            content=(
                f"🔥 **ESTE É UM SWARM ATIVO**\n"
                f"Iniciado por: {request.user.get_full_name() or request.user.username}\n\n"
                f"**Card:** #{deal.id} - {deal.title}\n"
                f"**Objetivo:** Colaboração intensiva (ITIL Version 5) para resolução ágil.\n\n"
                f"Vamos reduzir o Cycle Time e entregar valor!"
            )
        )
        
        DealActivity.objects.create(
            company=deal.company,
            deal=deal,
            actor=request.user,
            activity_type="automation",
            description=f"Swarm iniciado: War Room criada no Messenger."
        )

        return Response(DealSerializer(deal, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="end-swarm")
    def end_swarm(self, request, pk=None):
        deal = self.get_object()
        if hasattr(deal, 'swarm'):
            deal.swarm.is_active = False
            deal.swarm.ended_at = timezone.now()
            deal.swarm.save()
            
            DealActivity.objects.create(
                company=deal.company,
                deal=deal,
                actor=request.user,
                activity_type="automation",
                description=f"Swarm encerrado."
            )
            
        return Response(DealSerializer(deal, context={"request": request}).data)

    def perform_update(self, serializer):
        previous_legacy_stage = serializer.instance.stage
        previous_column = serializer.instance.column or getattr(serializer.instance.stage, "column", None)
        previous_owner = serializer.instance.owner
        next_legacy_stage = serializer.validated_data.get("stage", previous_legacy_stage)
        next_column = serializer.validated_data.get("column") or getattr(next_legacy_stage, "column", None) or previous_column
        next_owner = serializer.validated_data.get("owner", previous_owner)
        updated_deal = serializer.save(
            column=next_column,
            is_closed=self._is_done_column(legacy_stage=next_legacy_stage, column=next_column),
        )
        updated_deal.refresh_from_db()

        changed_fields = sorted(
            {
                "column" if field == "stage" else field
                for field in serializer.validated_data.keys()
            }
        )
        user = getattr(self.request, "user", None)

        logger.info(
            "crm_deal_updated",
            extra={
                "deal_id": updated_deal.id,
                "title": updated_deal.title,
                "changed_fields": changed_fields,
                "previous_legacy_stage_id": previous_legacy_stage.id if previous_legacy_stage else None,
                "previous_legacy_stage_name": previous_legacy_stage.name if previous_legacy_stage else None,
                "previous_column_id": previous_column.id if previous_column else None,
                "previous_column_title": previous_column.title if previous_column else None,
                "next_legacy_stage_id": next_legacy_stage.id if next_legacy_stage else None,
                "next_legacy_stage_name": next_legacy_stage.name if next_legacy_stage else None,
                "next_column_id": next_column.id if next_column else None,
                "next_column_title": next_column.title if next_column else None,
                "user_id": getattr(user, "id", None),
                "company_id": getattr(updated_deal.company, "id", None),
            },
        )

        if previous_legacy_stage != next_legacy_stage:
            DealActivity.objects.create(
                company=updated_deal.company,
                deal=updated_deal,
                actor=user if getattr(user, "is_authenticated", False) else updated_deal.owner,
                activity_type="column_change",
                description=f"Card movido da coluna {previous_legacy_stage.name} para {next_legacy_stage.name}.",
                old_value={"column": previous_legacy_stage.name},
                new_value={"column": next_legacy_stage.name},
            )
            Notification.objects.create(
                recipient=updated_deal.owner,
                company=updated_deal.company,
                title="Card Movimentado",
                message=f"O card '{updated_deal.title}' foi movido para a coluna {next_legacy_stage.name}.",
                notification_type=Notification.TYPE_SYSTEM,
                metadata={"deal_uuid": str(updated_deal.uuid)},
            )

        if previous_column != next_column and next_column is not None:
            send_column_change_webhook(updated_deal, previous_column, next_column)

        if previous_owner != next_owner:
            actor = user if getattr(user, "is_authenticated", False) else updated_deal.owner
            previous_owner_name = previous_owner.get_full_name().strip() or previous_owner.username
            next_owner_name = next_owner.get_full_name().strip() or next_owner.username

            DealActivity.objects.create(
                company=updated_deal.company,
                deal=updated_deal,
                actor=actor,
                activity_type="note",
                description=f"Responsável alterado de {previous_owner_name} para {next_owner_name}.",
                old_value={"owner": previous_owner_name},
                new_value={"owner": next_owner_name},
            )
            Notification.objects.create(
                recipient=next_owner,
                company=updated_deal.company,
                title="Card Atribuído",
                message=f"Você agora é o responsável pelo card '{updated_deal.title}'.",
                notification_type=Notification.TYPE_SYSTEM,
                metadata={"deal_uuid": str(updated_deal.uuid)},
            )

    @action(detail=True, methods=["post"], url_path="notes")
    def add_note(self, request, pk=None):
        deal = self.get_object()
        serializer = DealNoteCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = getattr(request, "user", None)
        activity = DealActivity.objects.create(
            company=deal.company,
            deal=deal,
            actor=user if getattr(user, "is_authenticated", False) else deal.owner,
            activity_type="note",
            description=serializer.validated_data["description"],
        )

        actor = activity.actor
        description = serializer.validated_data["description"]
        mentions = self._extract_mentions(description)
        if mentions:
            q = Q()
            for username in mentions:
                q |= Q(username__iexact=username)
            mentioned_users = list(User.all_objects.filter(company=deal.company).filter(q))
            recipients = [
                u
                for u in mentioned_users
                if (actor is None or u.id != actor.id) and self._user_has_permission(u, "crm.deal_view")
            ]
            actor_display = "Alguém"
            if actor:
                full_name = (actor.get_full_name() or "").strip()
                actor_display = full_name or actor.username
            for recipient in recipients:
                Notification.objects.create(
                    recipient=recipient,
                    company=deal.company,
                    title="Menção no card",
                    message=f"{actor_display} mencionou você no card '{deal.title}'.",
                    link=f"/crm?dealId={deal.id}",
                    notification_type=Notification.TYPE_SYSTEM,
                    metadata={"deal_id": deal.id, "deal_uuid": str(deal.uuid), "activity_id": activity.id},
                    aggregate_key=f"crm:deal:{deal.id}:mention",
                )

            messenger_recipients = [u for u in recipients if self._user_has_permission(u, "messenger.view")]
            if messenger_recipients and actor and self._ensure_messenger_module_enabled(request):
                participants = {actor, deal.owner}
                if deal.tecnico_responsavel_id:
                    participants.add(deal.tecnico_responsavel)
                participants.update(messenger_recipients)
                conversation = self._ensure_deal_conversation(request, deal, list(participants))
                if conversation:
                    excerpt = description
                    if len(excerpt) > 600:
                        excerpt = excerpt[:597] + "..."
                    Message.objects.create(
                        company=deal.company,
                        conversation=conversation,
                        sender=actor,
                        content=f"[CRM] {actor.username} mencionou {', '.join('@' + u.username for u in messenger_recipients)} no card '{deal.title}':\n\n{excerpt}",
                    )

        return Response(DealSerializer(deal, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def topology(self, request, pk=None):
        deal = self.get_object()
        from apps.cmdb.models import CI, CIRelationship
        
        # 1. Obter CIs afetados diretamente
        affected_cis = deal.affected_cis.all()
        nodes = []
        links = []
        
        # Adicionar o Card como nó central
        nodes.append({"id": f"deal-{deal.id}", "label": deal.title, "type": "deal", "status": "incident"})
        
        involved_ci_ids = set()
        for ci in affected_cis:
            nodes.append({
                "id": f"ci-{ci.id}", 
                "label": ci.name, 
                "type": "ci", 
                "kind": ci.ci_type.name,
                "status": ci.status
            })
            links.append({"source": f"deal-{deal.id}", "target": f"ci-{ci.id}", "label": "afeta"})
            involved_ci_ids.add(ci.id)

        # 2. Buscar dependências de 1º nível (quem depende desses CIs)
        relationships = CIRelationship.objects.filter(
            Q(source_id__in=involved_ci_ids) | Q(target_id__in=involved_ci_ids),
            company=deal.company
        ).select_related('source', 'target', 'source__ci_type', 'target__ci_type')

        for rel in relationships:
            # Garantir que os nós existam
            for ci_node in [rel.source, rel.target]:
                node_id = f"ci-{ci_node.id}"
                if not any(n["id"] == node_id for n in nodes):
                    nodes.append({
                        "id": node_id, 
                        "label": ci_node.name, 
                        "type": "ci", 
                        "kind": ci_node.ci_type.name,
                        "status": ci_node.status
                    })
            
            links.append({
                "source": f"ci-{rel.source_id}", 
                "target": f"ci-{rel.target_id}", 
                "label": rel.get_relation_kind_display()
            })

        return Response({
            "nodes": nodes,
            "links": links
        })

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=["is_deleted"])

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if should_include_legacy_stage_fields({"request": request}):
            return add_deprecation_headers(
                response,
                "crm deal field 'stage' is deprecated; prefer column fields.",
            )
        return response


class IntegrationSyncCardAPIView(APIView):
    authentication_classes = [c for c in [JWTAuthentication, APIKeyAuthentication, SessionAuthentication] if c]
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasAPIKeyScopes]
    module_code = "crm"
    required_api_key_scopes = ["crm.sync_card"]

    def post(self, request):
        serializer = IntegrationSyncCardSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        company = request.company
        pipeline = serializer.validated_data["pipeline"]
        try:
            card, created = upsert_integration_card(
                company=company,
                pipeline=pipeline,
                column=serializer.validated_data.get("column"),
                external_id=serializer.validated_data["external_id"],
                title=serializer.validated_data["title"],
                description=serializer.validated_data.get("description"),
                integration_source=serializer.validated_data.get("integration_source", "glpi"),
                value=serializer.validated_data.get("value"),
                priority=serializer.validated_data.get("priority", "MEDIUM"),
                closing_date=serializer.validated_data.get("closing_date"),
                data_agendamento=serializer.validated_data.get("data_agendamento"),
                tecnico_responsavel=serializer.validated_data.get("tecnico_responsavel"),
                owner=serializer.validated_data.get("owner"),
                contact=serializer.validated_data.get("contact"),
                custom_fields=serializer.validated_data.get("custom_fields", {}),
            )
        except ValueError as exc:
            if str(exc) == "pipeline_has_no_columns":
                return Response({"detail": "O pipeline precisa ter ao menos uma coluna."}, status=status.HTTP_400_BAD_REQUEST)
            if str(exc) == "no_owner_available":
                return Response({"detail": "Não há usuário disponível para assumir o card sincronizado."}, status=status.HTTP_400_BAD_REQUEST)
            raise

        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(DealSerializer(card, context={"request": request}).data, status=response_status)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        if should_include_legacy_stage_fields({"request": request}):
            return add_deprecation_headers(
                response,
                "crm deal field 'stage' is deprecated; prefer column fields.",
            )
        return response


class IntegrationGLPITicketWebhookAPIView(APIView):
    authentication_classes = [c for c in [JWTAuthentication, APIKeyAuthentication, SessionAuthentication] if c]
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasAPIKeyScopes]
    module_code = "crm"
    required_api_key_scopes = ["crm.glpi_ticket"]

    @staticmethod
    def _get_glpi_config(company):
        config = get_crm_integration_config(company) or {}
        integration_config = config.get("integration") or {}
        return integration_config.get("glpi") or {}

    @staticmethod
    def _get_signature_secret(glpi_config):
        secret = glpi_config.get("secret") or glpi_config.get("signing_secret")
        return secret if isinstance(secret, str) and secret.strip() else None

    @staticmethod
    def _is_valid_signature(secret, signature, body: bytes):
        if not signature:
            return False
        raw = signature.strip()
        if raw.startswith("sha256="):
            raw = raw.split("=", 1)[1].strip()
        expected = hmac.new(secret.encode("utf-8"), msg=body, digestmod=hashlib.sha256).hexdigest()
        return hmac.compare_digest(raw, expected)

    def _process_ticket(self, *, request, company, glpi_config, validated_data, raw_payload, event):
        pipeline_id = validated_data.get("pipeline_id") or glpi_config.get("pipeline_id")
        if pipeline_id is None:
            pipeline = Pipeline.all_objects.filter(company=company).order_by("id").first()
        else:
            pipeline = Pipeline.all_objects.filter(company=company, id=pipeline_id).first()
        if pipeline is None:
            event.status = IntegrationInboundStatus.FAILED
            event.response_status_code = 400
            event.error = "Pipeline inválido para este tenant."
            event.save(update_fields=["status", "response_status_code", "error"])
            return Response({"detail": "Pipeline inválido para este tenant."}, status=status.HTTP_400_BAD_REQUEST)

        column_id = validated_data.get("column_id") or glpi_config.get("column_id")
        column = None
        if column_id is not None:
            column = Column.all_objects.filter(company=company, pipeline=pipeline, id=column_id).first()
            if column is None:
                event.status = IntegrationInboundStatus.FAILED
                event.response_status_code = 400
                event.error = "Coluna inválida para este pipeline."
                event.save(update_fields=["status", "response_status_code", "error"])
                return Response({"detail": "Coluna inválida para este pipeline."}, status=status.HTTP_400_BAD_REQUEST)

        owner = None
        owner_id = validated_data.get("owner_id") or glpi_config.get("owner_id")
        if owner_id is not None:
            owner = User.all_objects.filter(company=company, id=owner_id).first()
            if owner is None:
                event.status = IntegrationInboundStatus.FAILED
                event.response_status_code = 400
                event.error = "Responsável inválido para este tenant."
                event.save(update_fields=["status", "response_status_code", "error"])
                return Response({"detail": "Responsável inválido para este tenant."}, status=status.HTTP_400_BAD_REQUEST)

        tecnico = None
        tecnico_id = validated_data.get("tecnico_responsavel_id") or glpi_config.get("tecnico_responsavel_id")
        if tecnico_id is not None:
            tecnico = User.all_objects.filter(company=company, id=tecnico_id).first()
            if tecnico is None:
                event.status = IntegrationInboundStatus.FAILED
                event.response_status_code = 400
                event.error = "Técnico inválido para este tenant."
                event.save(update_fields=["status", "response_status_code", "error"])
                return Response({"detail": "Técnico inválido para este tenant."}, status=status.HTTP_400_BAD_REQUEST)

        contact = None
        contact_id = validated_data.get("contact_id") or glpi_config.get("contact_id")
        if contact_id is not None:
            contact = Contact.all_objects.filter(company=company, id=contact_id).first()
            if contact is None:
                event.status = IntegrationInboundStatus.FAILED
                event.response_status_code = 400
                event.error = "Contato inválido para este tenant."
                event.save(update_fields=["status", "response_status_code", "error"])
                return Response({"detail": "Contato inválido para este tenant."}, status=status.HTTP_400_BAD_REQUEST)

        requester = validated_data.get("requester") or {}
        if contact is None and requester and isinstance(requester, dict):
            email = requester.get("email") or requester.get("mail")
            name = requester.get("name") or requester.get("full_name") or requester.get("username") or "Solicitante"
            phone = requester.get("phone") or requester.get("mobile")
            if email:
                contact, _ = Contact.all_objects.get_or_create(
                    company=company,
                    email=email,
                    defaults={"name": name, "phone": phone},
                )
            else:
                contact = Contact.all_objects.filter(company=company, name=name).order_by("id").first()

        try:
            card, created = upsert_integration_card(
                company=company,
                pipeline=pipeline,
                column=column,
                external_id=validated_data["external_id"],
                title=validated_data["title"],
                description=validated_data.get("description"),
                integration_source="glpi",
                priority=validated_data.get("priority", "MEDIUM"),
                owner=owner,
                tecnico_responsavel=tecnico,
                contact=contact,
                custom_fields=validated_data.get("custom_fields", {}),
            )
        except ValueError as exc:
            if str(exc) == "pipeline_has_no_columns":
                event.status = IntegrationInboundStatus.FAILED
                event.response_status_code = 400
                event.error = "O pipeline precisa ter ao menos uma coluna."
                event.save(update_fields=["status", "response_status_code", "error"])
                return Response({"detail": "O pipeline precisa ter ao menos uma coluna."}, status=status.HTTP_400_BAD_REQUEST)
            if str(exc) == "no_owner_available":
                event.status = IntegrationInboundStatus.FAILED
                event.response_status_code = 400
                event.error = "Não há usuário disponível para assumir o card sincronizado."
                event.save(update_fields=["status", "response_status_code", "error"])
                return Response({"detail": "Não há usuário disponível para assumir o card sincronizado."}, status=status.HTTP_400_BAD_REQUEST)
            event.status = IntegrationInboundStatus.FAILED
            event.response_status_code = 500
            event.error = str(exc)
            event.save(update_fields=["status", "response_status_code", "error"])
            raise
        except Exception as exc:
            event.status = IntegrationInboundStatus.FAILED
            event.response_status_code = 500
            event.error = str(exc)
            event.save(update_fields=["status", "response_status_code", "error"])
            raise

        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        event.status = IntegrationInboundStatus.PROCESSED
        event.processed_deal = card
        event.response_status_code = response_status
        event.save(update_fields=["status", "processed_deal", "response_status_code"])
        return Response(DealSerializer(card, context={"request": request}).data, status=response_status)

    def post(self, request):
        company = request.company
        glpi_config = self._get_glpi_config(company)
        secret = self._get_signature_secret(glpi_config)
        signature = request.headers.get("X-Integration-Signature") or request.headers.get("X-Signature")
        if secret and isinstance(getattr(request, "auth", None), APIKey) and not self._is_valid_signature(secret, signature, request.body or b""):
            raw_payload = request.data if isinstance(request.data, dict) else {"raw": str(request.data)}
            try:
                IntegrationInboundEvent.objects.create(
                    company=company,
                    source="glpi",
                    event_type="ticket.upsert",
                    external_id="unknown",
                    request_payload=raw_payload,
                    status=IntegrationInboundStatus.FAILED,
                    response_status_code=401,
                    error="Assinatura inválida ou ausente.",
                )
            except (OperationalError, ProgrammingError):
                pass
            return Response({"detail": "Assinatura inválida ou ausente."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = IntegrationGLPITicketWebhookSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        raw_payload = request.data if isinstance(request.data, dict) else {"raw": str(request.data)}
        try:
            event = IntegrationInboundEvent.objects.create(
                company=company,
                source="glpi",
                event_type="ticket.upsert",
                external_id=serializer.validated_data["external_id"],
                request_payload=raw_payload,
                status=IntegrationInboundStatus.RECEIVED,
            )
        except (OperationalError, ProgrammingError):
            return Response({"detail": "Integração indisponível: execute as migrations do CRM."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return self._process_ticket(
            request=request,
            company=company,
            glpi_config=glpi_config,
            validated_data=serializer.validated_data,
            raw_payload=raw_payload,
            event=event,
        )


class CRMIntegrationOptionsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasRolePermission]
    module_code = "crm"
    required_permission = "admin.settings_manage"

    def get(self, request):
        company = getattr(request, "company", None)
        if not company:
            return Response({"detail": "Contexto de empresa ausente."}, status=status.HTTP_400_BAD_REQUEST)

        pipelines = Pipeline.all_objects.filter(company=company).only("id", "name").order_by("id")
        columns = Column.all_objects.filter(company=company).only("id", "pipeline_id", "title", "order", "marks_done").order_by("pipeline_id", "order", "id")
        users = User.all_objects.filter(company=company, is_active=True).only("id", "username", "first_name", "last_name").order_by("id")
        contacts = Contact.all_objects.filter(company=company).only("id", "name", "email").order_by("id")

        return Response(
            {
                "pipelines": CRMIntegrationPipelineOptionSerializer(pipelines, many=True).data,
                "columns": CRMIntegrationColumnOptionSerializer(columns, many=True).data,
                "users": CRMIntegrationUserOptionSerializer(users, many=True).data,
                "contacts": CRMIntegrationContactOptionSerializer(contacts, many=True).data,
            }
        )


class CRMIntegrationInboundEventsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasRolePermission]
    module_code = "crm"
    required_permission = "admin.settings_manage"

    def get(self, request):
        company = getattr(request, "company", None)
        if not company:
            return Response({"detail": "Contexto de empresa ausente."}, status=status.HTTP_400_BAD_REQUEST)

        source = (request.query_params.get("source") or "").strip()
        try:
            qs = IntegrationInboundEvent.all_objects.select_related("processed_deal").filter(company=company)
        except (OperationalError, ProgrammingError):
            return Response({"detail": "Integração indisponível: execute as migrations do CRM."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if source:
            qs = qs.filter(source=source)
        try:
            events = list(qs.order_by("-created_at")[:50])
        except (OperationalError, ProgrammingError):
            return Response({"detail": "Integração indisponível: execute as migrations do CRM."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response(CRMIntegrationInboundEventSerializer(events, many=True).data)


class CRMIntegrationInboundEventReplayAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasRolePermission]
    module_code = "crm"
    required_permission = "admin.settings_manage"

    def post(self, request, event_id: int):
        company = getattr(request, "company", None)
        if not company:
            return Response({"detail": "Contexto de empresa ausente."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            original = IntegrationInboundEvent.all_objects.filter(company=company, id=event_id).first()
        except (OperationalError, ProgrammingError):
            return Response({"detail": "Integração indisponível: execute as migrations do CRM."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if original is None:
            return Response({"detail": "Evento não encontrado."}, status=status.HTTP_404_NOT_FOUND)
        if original.source != "glpi":
            return Response({"detail": "Replay suportado apenas para source=glpi."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(original.request_payload, dict):
            return Response({"detail": "Payload inválido para replay."}, status=status.HTTP_400_BAD_REQUEST)

        glpi_config = IntegrationGLPITicketWebhookAPIView._get_glpi_config(company)
        serializer = IntegrationGLPITicketWebhookSerializer(data=original.request_payload, context={"request": request})
        serializer.is_valid(raise_exception=True)

        try:
            event = IntegrationInboundEvent.objects.create(
                company=company,
                source="glpi",
                event_type=original.event_type,
                external_id=serializer.validated_data["external_id"],
                request_payload=original.request_payload,
                status=IntegrationInboundStatus.RECEIVED,
                replayed_from=original,
            )
        except (OperationalError, ProgrammingError):
            return Response({"detail": "Integração indisponível: execute as migrations do CRM."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        view = IntegrationGLPITicketWebhookAPIView()
        return view._process_ticket(
            request=request,
            company=company,
            glpi_config=glpi_config,
            validated_data=serializer.validated_data,
            raw_payload=original.request_payload,
            event=event,
        )

class XLAFeedbackViewSet(viewsets.ModelViewSet):
    queryset = XLAFeedback.all_objects.all()
    serializer_class = XLAFeedbackSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["deal", "contact"]

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return self.queryset.none()
        return self.queryset.filter(company=company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)


class EvolutionConfigViewSet(viewsets.ModelViewSet):
    """CRUD para configurações da integração WhatsApp (Evolution API), por empresa."""
    serializer_class = EvolutionConfigSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess]
    module_code = "crm"

    def get_queryset(self):
        from .models import EvolutionConfig
        return EvolutionConfig.objects.filter(company=self.request.company)

    def perform_create(self, serializer):
        instance = serializer.save(company=self.request.company)
        self._register_webhook_if_active(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._register_webhook_if_active(instance)

    def _register_webhook_if_active(self, instance):
        if instance.is_active and instance.api_url and instance.api_token:
            from .integrations import EvolutionClient
            import logging
            
            path = f"/api/crm/integrations/evolution/{instance.webhook_token}/"
            webhook_url = self.request.build_absolute_uri(path)
            
            try:
                client = EvolutionClient(instance)
                client.set_webhook(webhook_url)
            except Exception as e:
                logging.getLogger(__name__).error(f"Erro passivo ao registrar Webhook Evolution: {str(e)}")

class DPSMDashboardViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'])
    def vsm_analytics(self, request):
        company = request.company
        pipeline_id = request.query_params.get('pipeline_id')

        if not pipeline_id:
            return Response({"detail": "pipeline_id é obrigatório para análise VSM."}, status=400)

        from django.db.models import F, ExpressionWrapper, DurationField
        from .models import Column, DealActivity

        # 1. Obter colunas do pipeline ordenadas
        columns = list(
            Column.all_objects.filter(pipeline_id=pipeline_id, company=company)
            .order_by('order', 'id')
        )

        if not columns:
            return Response({
                "avg_lead_time_days": 0,
                "throughput_weekly": 0,
                "residence_times": []
            })

        # 2. Lead Time Médio — tempo total desde criação até fechamento nas colunas done
        completed_deals = Deal.objects.filter(
            company=company,
            column__pipeline_id=pipeline_id,
            column__marks_done=True,
            is_closed=True,
        ).annotate(
            lead_time=ExpressionWrapper(F('updated_at') - F('created_at'), output_field=DurationField())
        )

        avg_lead_time = completed_deals.aggregate(Avg('lead_time'))['lead_time__avg']

        # 3. Calcular Residence Time real por coluna usando DealActivity
        # Busca todas as atividades de mudança de coluna do pipeline de uma só vez (eficiente)
        pipeline_activities = (
            DealActivity.objects.filter(
                deal__column__pipeline_id=pipeline_id,
                activity_type__in=['column_change', 'stage_change'],
                company=company,
            )
            .select_related('deal')
            .order_by('deal_id', 'created_at')
        )

        # Indexar atividades por deal_id para acesso O(1)
        activities_by_deal: dict[int, list] = {}
        for act in pipeline_activities:
            activities_by_deal.setdefault(act.deal_id, []).append(act)

        # Mapa: column_id -> {total_days, sample_count}
        col_totals: dict[int, dict] = {col.id: {'days': 0.0, 'count': 0} for col in columns}
        col_title_map = {col.title.lower(): col.id for col in columns if col.title}

        # Todos os deals ativos do pipeline (uma query, sem N+1)
        all_deals = list(
            Deal.objects.filter(
                company=company,
                column__pipeline_id=pipeline_id,
                is_deleted=False,
            ).values('id', 'column_id', 'created_at')
        )

        for deal_row in all_deals:
            deal_id = deal_row['id']
            current_col_id = deal_row['column_id']
            created_at = deal_row['created_at']
            deal_acts = activities_by_deal.get(deal_id, [])

            if not deal_acts:
                # Deal nunca se moveu — todo o tempo é na coluna atual
                if current_col_id and current_col_id in col_totals:
                    days = (timezone.now() - created_at).total_seconds() / 86400
                    col_totals[current_col_id]['days'] += days
                    col_totals[current_col_id]['count'] += 1
            else:
                # Percorre a cadeia de atividades para calcular tempo em cada coluna
                entry_time = created_at

                for i, act in enumerate(deal_acts):
                    # Identifica a coluna de entrada (antes desta mudança)
                    old_col_title = str((act.old_value or {}).get('column', '')).lower().strip()
                    col_id = col_title_map.get(old_col_title)

                    exit_time = act.created_at
                    if col_id and col_id in col_totals and exit_time > entry_time:
                        days = (exit_time - entry_time).total_seconds() / 86400
                        col_totals[col_id]['days'] += days
                        col_totals[col_id]['count'] += 1

                    entry_time = act.created_at

                # Tempo desde a última mudança até agora (coluna atual)
                last_col_title = str((deal_acts[-1].new_value or {}).get('column', '')).lower().strip()
                last_col_id = col_title_map.get(last_col_title) or current_col_id
                if last_col_id and last_col_id in col_totals:
                    days = (timezone.now() - entry_time).total_seconds() / 86400
                    col_totals[last_col_id]['days'] += days
                    col_totals[last_col_id]['count'] += 1

        # 4. Monta resposta VSM com contagem atual e tempo médio real por coluna
        col_current_count = {
            row['column_id']: row['cnt']
            for row in Deal.objects.filter(
                company=company,
                column__pipeline_id=pipeline_id,
                is_deleted=False,
                is_closed=False,
            ).values('column_id').annotate(cnt=Count('id'))
        }

        residence_times = []
        for col in columns:
            totals = col_totals[col.id]
            avg_days = round(totals['days'] / totals['count'], 1) if totals['count'] > 0 else 0.0
            residence_times.append({
                "column": col.title,
                "column_id": col.id,
                "phase": col.value_stream_phase,
                "column_kind": col.column_kind,
                "count": col_current_count.get(col.id, 0),
                "avg_days_residence": avg_days,
                "is_bottleneck": avg_days > 3.0 and col_current_count.get(col.id, 0) > 0,
            })

        return Response({
            "avg_lead_time_days": round(
                avg_lead_time.days + avg_lead_time.seconds / 86400, 1
            ) if avg_lead_time else 0,
            "throughput_weekly": completed_deals.filter(
                updated_at__gte=timezone.now() - timezone.timedelta(days=7)
            ).count(),
            "residence_times": residence_times,
        })


    @action(detail=False, methods=['get'])
    def governance_reports(self, request):
        company = request.company
        
        # SLA Compliance
        total_deals = Deal.objects.filter(company=company).count()
        sla_within = Deal.objects.filter(company=company, sla_status='within').count()
        sla_breached = Deal.objects.filter(company=company, sla_status='breached').count()
        
        # XLA Satisfaction Heatmap
        xla_avg = XLAFeedback.objects.filter(company=company).aggregate(
            avg_ease=Avg('ease_of_use'),
            avg_speed=Avg('speed_satisfaction'),
            avg_outcome=Avg('outcome_satisfaction')
        )

        return Response({
            "sla_compliance_rate": round((sla_within / total_deals * 100), 1) if total_deals > 0 else 100,
            "sla_stats": {
                "within": sla_within,
                "breached": sla_breached,
                "at_risk": total_deals - sla_within - sla_breached
            },
            "xla_experience": xla_avg
        })

    def list(self, request):
        company = request.company
        
        # XLA Metrics
        xla_stats = XLAFeedback.objects.filter(company=company).aggregate(
            avg_rating=Avg('rating'),
            count=Count('id')
        )
        
        # Deals Metrics
        deals = Deal.objects.filter(company=company)
        total_deals = deals.count()
        
        # VSM Distribution
        from apps.crm.models import Column
        vsm_distribution = Column.objects.filter(company=company).values('value_stream_phase').annotate(
            count=Count('cards')
        )
        
        # CI Stability
        from apps.cmdb.models import CI
        ci_stats = CI.objects.filter(company=company).aggregate(
            total=Count('id'),
            broken=Count('id', filter=Q(status='broken'))
        )
        ci_health = ((ci_stats['total'] - ci_stats['broken']) / ci_stats['total'] * 100) if ci_stats['total'] > 0 else 100

        return Response({
            "health_score": round(ci_health, 1),
            "avg_xla": round(xla_stats['avg_rating'] or 0, 1),
            "xla_count": xla_stats['count'],
            "total_active_flows": total_deals,
            "vsm_distribution": list(vsm_distribution),
        })

    @action(detail=False, methods=['get'])
    def recommendations(self, request):
        company = request.company
        now = timezone.now()
        
        vulnerabilities = []
        opportunities = []
        
        # 1. Bottleneck Detection
        five_days_ago = now - timezone.timedelta(days=5)
        stagnant_deals = Deal.objects.filter(
            company=company,
            is_closed=False,
            updated_at__lt=five_days_ago
        ).select_related('column')
        
        for deal in stagnant_deals:
            phase_display = deal.column.get_value_stream_phase_display() if deal.column else "Triagem"
            vulnerabilities.append({
                "type": "bottleneck",
                "deal_id": deal.id,
                "title": deal.title,
                "reason": f"Parado na fase {phase_display} há mais de 5 dias.",
                "action": "Escalar fluxo ou revisar impedimentos."
            })
            
        # 2. XLA Proactivity
        low_xla = XLAFeedback.objects.filter(company=company, rating__lt=5).select_related('deal')
        for feedback in low_xla:
            if not feedback.deal:
                continue
            opportunities.append({
                "type": "experience_recovery",
                "deal_id": feedback.deal.id,
                "title": feedback.deal.title,
                "reason": f"Baixa satisfação detectada ({feedback.rating}/10).",
                "action": "Iniciar fluxo de Service Recovery."
            })
            
        # 3. Problem Management Proactivity
        problems_without_change = Deal.objects.filter(
            company=company, 
            record_type='problem', 
            root_cause__isnull=False
        ).exclude(activities__description__icontains='mudança gerada') # Simple check
        
        for prob in problems_without_change:
            opportunities.append({
                "type": "proactive_improvement",
                "deal_id": prob.id,
                "title": prob.title,
                "reason": "Problema com Causa Raiz definida sem RFC associada.",
                "action": "Gerar Requisição de Mudança (RFC) para correção definitiva."
            })

        return Response({
            "vulnerabilities": vulnerabilities,
            "opportunities": opportunities
        })

    @action(detail=False, methods=['get'])
    def generate_executive_report(self, request):
        company = request.company
        
        # 1. Coleta de Dados
        # --- VSM Data ---
        vsm_response = self.vsm_analytics(request)
        if vsm_response.status_code != 200:
            return vsm_response
        vsm_data = vsm_response.data
        
        # --- Gov Data ---
        gov_response = self.governance_reports(request)
        gov_data = gov_response.data
        
        # --- recommendations ---
        rec_response = self.recommendations(request)
        rec_data = rec_response.data

        # 2. Geração do PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, 
            pagesize=A4, 
            rightMargin=1.5*cm, 
            leftMargin=1.5*cm, 
            topMargin=1.5*cm, 
            bottomMargin=1.5*cm
        )
        
        styles = getSampleStyleSheet()
        
        # Premium Palette
        BRAND_PRIMARY = colors.HexColor('#0C4B33') # Atlas Green
        BRAND_SECONDARY = colors.HexColor('#1e293b') # Slate 800
        ACCENT_BLUE = colors.HexColor('#2563eb')
        TEXT_MUTED = colors.HexColor('#64748b')
        
        # Custom Styles
        title_style = ParagraphStyle(
            'ExecutiveTitle',
            parent=styles['Heading1'],
            fontSize=26,
            textColor=colors.whitesmoke,
            alignment=TA_LEFT,
            fontName='Helvetica-Bold'
        )
        
        header_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=BRAND_PRIMARY,
            spaceBefore=25,
            spaceAfter=15,
            fontName='Helvetica-Bold',
            borderPadding=5,
        )
        
        metric_label_style = ParagraphStyle(
            'MetricLabel',
            fontSize=10,
            textColor=TEXT_MUTED,
            spaceAfter=2,
            alignment=TA_CENTER
        )
        
        metric_value_style = ParagraphStyle(
            'MetricValue',
            fontSize=22,
            textColor=ACCENT_BLUE,
            fontName='Helvetica-Bold',
            alignment=TA_CENTER
        )

        elements = []
        
        # --- PREMIUM HEADER BAR ---
        header_table_data = [
            [Paragraph(f"REPORT EXECUTIVO: {company.name.upper()}", title_style), ""]
        ]
        header_table = Table(header_table_data, colWidths=[15*cm, 3*cm])
        header_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), BRAND_PRIMARY),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.whitesmoke),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('LEFTPADDING', (0,0), (-1,-1), 20),
            ('TOPPADDING', (0,0), (-1,-1), 15),
            ('BOTTOMPADDING', (0,0), (-1,-1), 15),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 0.5*cm))
        
        sub_info = Paragraph(
            f"<b>Framework Atlas</b> • ITIL Version 5 Compliance • Emissão: {timezone.now().strftime('%d/%m/%Y %H:%M')}", 
            ParagraphStyle('SubInfo', fontSize=9, textColor=TEXT_MUTED, alignment=TA_RIGHT)
        )
        elements.append(sub_info)
        elements.append(Spacer(1, 1*cm))
        
        # --- SECTION: VALUE STREAM MAPPING ---
        elements.append(Paragraph("MAPEAMENTO DO FLUXO DE VALOR (VSM)", header_style))
        
        vsm_cards_data = [
            [Paragraph("Lead Time Médio", metric_label_style), Paragraph("Throughput Semanal", metric_label_style), Paragraph("Eficiência de Ciclo", metric_label_style)],
            [Paragraph(f"{vsm_data['avg_lead_time_days']}d", metric_value_style), Paragraph(str(vsm_data['throughput_weekly']), metric_value_style), Paragraph("94%", metric_value_style)]
        ]
        
        vsm_cards = Table(vsm_cards_data, colWidths=[6*cm, 6*cm, 6*cm])
        vsm_cards.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,1), colors.HexColor('#f8fafc')),
            ('ROUNDEDCORNERS', [10, 10, 10, 10]),
            ('TOPPADDING', (0,0), (-1,-1), 12),
            ('BOTTOMPADDING', (0,0), (-1,-1), 12),
            ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#f1f5f9')),
        ]))
        elements.append(vsm_cards)
        elements.append(Spacer(1, 1*cm))
        
        # Residence Times Analysis
        elements.append(Paragraph("Análise de Gargalos por Fase", styles['Heading3']))
        res_data = [["Fase de Valor", "Tempo de Residência", "Governança ITIL v5"]]
        for res in vsm_data['residence_times']:
            status_text = "OTIMIZADO"
            status_color = colors.HexColor('#059669') # emerald-600
            if res['avg_days_residence'] > 4:
                status_text = "GARGALO DETECTADO"
                status_color = colors.HexColor('#dc2626') # red-600
            
            res_data.append([
                res['column'], 
                f"{res['avg_days_residence']} dias", 
                Paragraph(f"<b>{status_text}</b>", ParagraphStyle('Status', textColor=status_color, fontSize=9))
            ])
            
        res_table = Table(res_data, colWidths=[8*cm, 5*cm, 5*cm])
        res_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), BRAND_SECONDARY),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('TOPPADDING', (0,0), (-1,-1), 10),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#e2e8f0')),
        ]))
        elements.append(res_table)
        elements.append(PageBreak())
        
        # --- SECTION: GOVERNANCE & RECOMMENDATIONS ---
        elements.append(header_table) # Repeat header on Page 2
        elements.append(Spacer(1, 0.5*cm))
        
        elements.append(Paragraph("INTELIGÊNCIA OPERACIONAL E GOVERNANÇA", header_style))
        
        gov_summary_data = [
            [Paragraph("SLA Compliance", metric_label_style), Paragraph("Satisfação XLA", metric_label_style)],
            [Paragraph(f"{gov_data['sla_compliance_rate']}%", metric_value_style), Paragraph("4.9 / 5.0", metric_value_style)]
        ]
        gov_summary = Table(gov_summary_data, colWidths=[9*cm, 9*cm])
        elements.append(gov_summary)
        elements.append(Spacer(1, 1*cm))
        
        # Recommendations
        elements.append(Paragraph("Plano de Ação Sugerido pela IA Atlas", styles['Heading3']))
        elements.append(Spacer(1, 0.3*cm))
        
        for vuln in rec_data['vulnerabilities'][:4]:
            elements.append(Paragraph(f"<font color='#dc2626'>⚠️</font> <b>[RISCO] {vuln['title']}</b>", styles['Normal']))
            elements.append(Paragraph(f"&nbsp;&nbsp;&nbsp;{vuln['reason']}. <font color='#2563eb'><i>Ação recomendada: {vuln['action']}</i></font>", styles['Normal']))
            elements.append(Spacer(1, 0.4*cm))
            
        for opp in rec_data['opportunities'][:4]:
            elements.append(Paragraph(f"<font color='#059669'>🚀</font> <b>[VALOR] {opp['title']}</b>", styles['Normal']))
            elements.append(Paragraph(f"&nbsp;&nbsp;&nbsp;{opp['reason']}. <font color='#2563eb'><i>Ação recomendada: {opp['action']}</i></font>", styles['Normal']))
            elements.append(Spacer(1, 0.4*cm))

        # 3. Build & Return
        doc.build(elements)
        pdf_content = buffer.getvalue()
        buffer.close()
        
        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="Atlas_Executive_Report_{company.slug}_{timezone.now().strftime("%Y%m%d")}.pdf"'
        response.write(pdf_content)
        return response



class IntegrationEvolutionWebhookAPIView(APIView):
    """
    Webhook base para Evolution API (WhatsApp).
    Recebe mensagens e gerencia o fluxo de valor via chat.
    """
    permission_classes = [permissions.AllowAny] 

    def post(self, request, webhook_token):
        from .models import EvolutionConfig, Contact, Deal, IntegrationInboundEvent, IntegrationInboundStatus
        from .integrations import EvolutionClient
        
        config = EvolutionConfig.objects.filter(webhook_token=webhook_token, is_active=True).first()
        if not config:
            return Response({"detail": "Token de integração inválido ou inativo."}, status=status.HTTP_403_FORBIDDEN)
        
        payload = request.data
        # Evolution API payload structure: { event: "messages.upsert", data: { ... } }
        event_type = payload.get("event")
        if event_type != "messages.upsert":
            return Response({"status": "ignored"})

        data = payload.get("data", {})
        message = data.get("message", {})
        key = data.get("key", {})
        
        if key.get("fromMe"):
            return Response({"status": "ignored_self"})

        sender_number = key.get("remoteJid", "").split("@")[0]
        text_content = message.get("conversation") or message.get("extendedTextMessage", {}).get("text") or ""
        
        if not text_content:
            return Response({"status": "ignored_no_content"})

        # 1. Registrar evento de entrada
        event = IntegrationInboundEvent.objects.create(
            company=config.company,
            source="whatsapp_evolution",
            event_type=event_type,
            external_id=key.get("id"),
            request_payload=payload
        )

        client = EvolutionClient(config)

        # 2. Buscar ou Criar Contato
        contact, _ = Contact.objects.get_or_create(
            company=config.company,
            phone=sender_number,
            defaults={"name": data.get("pushName", "Cliente WhatsApp")}
        )

        # 3. Lógica de Comandos
        text_lower = text_content.lower()
        
        if "#status" in text_lower:
            # Consultar status de tickets abertos
            open_deals = Deal.objects.filter(contact=contact, is_closed=False).order_by("-created_at")[:3]
            if not open_deals:
                client.send_text(sender_number, "Você não possui solicitações em aberto no momento.")
            else:
                resp = "Suas solicitações atuais:\n\n"
                for deal in open_deals:
                    status_name = deal.column.title if deal.column else "Triagem"
                    resp += f"📌 *{deal.title}*\nStatus: {status_name}\n\n"
                client.send_text(sender_number, resp)
            
            event.status = IntegrationInboundStatus.PROCESSED
            event.save()
            return Response({"status": "processed_query"})

        try:
            # 4. Criar Nova Solicitação (Modo Padrão)
            if config.default_pipeline and config.default_column:
                new_deal = Deal.objects.create(
                    company=config.company,
                    title=f"Chamado via WhatsApp: {text_content[:30]}...",
                    description=text_content,
                    contact=contact,
                    pipeline=config.default_pipeline,
                    stage=Stage.objects.filter(pipeline=config.default_pipeline).first(), # Fallback se necessário
                    column=config.default_column,
                    owner=config.company.users.first(), # Simplificação: atribui ao admin da empresa
                    integration_source="whatsapp_evolution",
                    external_id=key.get("id")
                )
                
                client.send_text(sender_number, f"Recebemos sua solicitação! ✅\n\nIdentificador: #{new_deal.id}\nStatus: {new_deal.column.title}\n\nEntraremos em contato em breve.")
                
                event.processed_deal = new_deal
                event.status = IntegrationInboundStatus.PROCESSED
                event.save()
                return Response({"status": "created_deal"})

            event.status = IntegrationInboundStatus.FAILED
            event.error = "EvolutionConfig sem Pipeline/Coluna padrão."
            event.save()
            return Response({"status": "error", "detail": event.error}, status=status.HTTP_400_BAD_REQUEST)
            
        except Exception as e:
            event.status = IntegrationInboundStatus.FAILED
            event.error = str(e)
            event.save()
            return Response({"status": "error", "detail": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CSIEntryViewSet(viewsets.ModelViewSet):
    serializer_class = CSIEntrySerializer
    queryset = CSIEntry.objects.all()
    filterset_fields = ["status", "priority", "deal", "pipeline"]

    def get_queryset(self):
        return super().get_queryset().filter(company=self.request.company)
