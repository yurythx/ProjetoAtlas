import hashlib
import hmac
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.api_keys.models import APIKey
from apps.calendar.models import Event
from apps.core.models import Company
from apps.crm.models import (
    Column,
    Contact,
    CRMGroup,
    CRMSavedView,
    Deal,
    IntegrationInboundEvent,
    IntegrationInboundStatus,
    Pipeline,
    Stage,
)
from apps.module_manager.models import Module, TenantModule
from apps.notifications.models import Notification

User = get_user_model()


class CRMIntegrationTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        self.user = User.objects.create_user(username="tecnico", password="password", company=self.company)

        # Cria um contato
        self.contact = Contact.objects.create(company=self.company, name="João Cliente", email="joao@cliente.com")

    def test_pipeline_creates_default_stages(self):
        """Testa se a criação de um Pipeline gera as colunas [Novo, Planejados, Em Andamento, Concluído]."""
        pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")

        stages = Stage.all_objects.filter(pipeline=pipeline)
        self.assertEqual(stages.count(), 4)
        stage_names = list(stages.values_list("name", flat=True))
        self.assertIn("Novo", stage_names)
        self.assertIn("Concluído", stage_names)

        columns = Column.all_objects.filter(pipeline=pipeline)
        self.assertEqual(columns.count(), 4)
        self.assertIn("Novo", list(columns.values_list("title", flat=True)))
        columns_by_title = {column.title: column for column in columns}
        self.assertEqual(columns_by_title["Novo"].column_kind, "backlog")
        self.assertEqual(columns_by_title["Planejados"].column_kind, "planned")
        self.assertTrue(columns_by_title["Planejados"].requires_schedule)
        self.assertTrue(columns_by_title["Planejados"].requires_assignee)
        self.assertEqual(columns_by_title["Em Andamento"].column_kind, "active")
        self.assertEqual(columns_by_title["Concluído"].column_kind, "done")
        self.assertTrue(columns_by_title["Concluído"].marks_done)

    def test_stage_route_is_no_longer_exposed(self):
        user = User.objects.create_user(username="legacy-stage-user", password="password", company=self.company)

        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

        crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=crm_module,
            defaults={"is_active": True},
        )

        response = client.get("/api/crm/stages/")
        self.assertEqual(response.status_code, 404)

    def test_deal_syncs_with_calendar(self):
        """Testa se um card criado com data gera um evento no calendário."""
        pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        stage = Stage.all_objects.get(pipeline=pipeline, name="Novo")

        calendar_module, _ = Module.objects.get_or_create(
            code="calendar",
            defaults={"name": "Calendário", "description": "Agenda e eventos"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=calendar_module,
            defaults={"is_active": True},
        )

        scheduled_at = timezone.now() + timezone.timedelta(days=2)

        deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Manutenção Servidor",
            contact=self.contact,
            stage=stage,
            data_agendamento=scheduled_at,
            priority="URGENT",
        )

        deal.refresh_from_db()
        self.assertIsNotNone(deal.column_id)
        self.assertEqual(deal.column.title, "Novo")
        self.assertIsNotNone(deal.linked_event_id)
        event = Event.all_objects.get(id=deal.linked_event_id)
        self.assertEqual(event.title, "[URGENT] Manutenção Servidor")
        self.assertEqual(event.color_category, "red")
        self.assertEqual(event.start_datetime, deal.data_agendamento)

    def test_notification_on_deal_movement(self):
        """Testa se mover o card gera uma notificação no sistema."""
        pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        novo = Stage.all_objects.get(pipeline=pipeline, name="Novo")
        execucao = Stage.all_objects.get(pipeline=pipeline, name="Em Andamento")

        deal = Deal.all_objects.create(
            company=self.company, owner=self.user, title="Troca de Teclado", contact=self.contact, stage=novo
        )

        Notification.all_objects.all().delete()

        deal.stage = execucao
        deal.save(update_fields=["stage"])
        deal.refresh_from_db()

        notification = Notification.all_objects.filter(recipient=self.user, title="Card Movimentado").first()
        self.assertIsNotNone(notification)
        self.assertIn("coluna", notification.message.lower())
        self.assertIn("Em Andamento", notification.message)


class CRMPipelineGroupAccessTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="CRM Corp", slug="crm-corp")

        crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(company=self.company, module=crm_module, defaults={"is_active": True})

        self.admin_role = Role.objects.create(company=self.company, name="Admin Local", permissions=["*"])
        self.member_role = Role.objects.create(company=self.company, name="Member Local", permissions=["crm.deal_view"])

        self.admin = User.all_objects.create_user(
            username="admin",
            email="admin@crm.corp",
            password="pass",
            company=self.company,
            role=self.admin_role,
        )
        self.member = User.all_objects.create_user(
            username="member",
            email="member@crm.corp",
            password="pass",
            company=self.company,
            role=self.member_role,
        )

        self.client.force_authenticate(user=self.admin)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

    def test_create_pipeline_company_visibility_succeeds(self):
        response = self.client.post(
            "/api/crm/pipelines/",
            {"name": "Comercial", "visibility": "company"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Comercial")
        self.assertEqual(response.data["visibility"], "company")

    def test_create_pipeline_group_visibility_requires_groups(self):
        response = self.client.post(
            "/api/crm/pipelines/",
            {"name": "Suporte", "visibility": "group"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("groups", response.data)

    def test_group_visibility_isolated_by_user_group_membership(self):
        group = CRMGroup.all_objects.create(company=self.company, name="Suporte", slug="suporte")

        company_pipeline = Pipeline.all_objects.create(company=self.company, name="Empresa", visibility="company")
        group_pipeline = Pipeline.all_objects.create(company=self.company, name="Somente Grupo", visibility="group")
        group_pipeline.groups.add(group)

        member_client = APIClient()
        member_client.force_authenticate(user=self.member)
        member_client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

        res = member_client.get("/api/crm/pipelines/")
        self.assertEqual(res.status_code, 200)
        data = res.data.get("results", res.data)
        returned_ids = {item["id"] for item in data}
        self.assertIn(company_pipeline.id, returned_ids)
        self.assertNotIn(group_pipeline.id, returned_ids)

        self.member.crm_groups.add(group)
        res = member_client.get("/api/crm/pipelines/")
        self.assertEqual(res.status_code, 200)
        data = res.data.get("results", res.data)
        returned_ids = {item["id"] for item in data}
        self.assertIn(company_pipeline.id, returned_ids)
        self.assertIn(group_pipeline.id, returned_ids)

    def test_create_pipeline_group_visibility_with_groups_succeeds(self):
        group = CRMGroup.all_objects.create(company=self.company, name="Comercial", slug="comercial")
        response = self.client.post(
            "/api/crm/pipelines/",
            {"name": "Pipeline Comercial", "visibility": "group", "groups": [group.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["visibility"], "group")
        self.assertEqual(response.data["groups"], [group.id])


class CRMDealApiUpdateTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        role = Role.all_objects.create(company=self.company, name="TestRole", permissions=["*"])
        self.user = User.objects.create_user(username="tecnico", password="password", company=self.company, role=role)
        self.second_user = User.objects.create_user(username="analista", password="password", company=self.company, role=role)
        self.outsider = User.objects.create_user(
            username="externo",
            password="password",
            company=Company.objects.create(name="Outra Empresa", slug="outra-empresa"),
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )

        self.contact = Contact.objects.create(company=self.company, name="João Cliente", email="joao@cliente.com")
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        self.planned = Stage.all_objects.get(pipeline=self.pipeline, name="Planejados")
        self.in_progress = Stage.all_objects.get(pipeline=self.pipeline, name="Em Andamento")
        self.done = Stage.all_objects.get(pipeline=self.pipeline, name="Concluído")
        self.deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Troca de Firewall",
            contact=self.contact,
            stage=self.in_progress,
            priority="MEDIUM",
        )

    def test_patch_stage_logs_and_persists_history(self):
        with patch("apps.crm.views.logger.info") as logger_info:
            response = self.client.patch(f"/api/crm/deals/{self.deal.id}/", {"stage": self.done.id}, format="json")

        self.assertEqual(response.status_code, 200)

        self.deal.refresh_from_db()
        self.assertEqual(self.deal.stage, self.done)
        self.assertEqual(self.deal.column, self.done.column)
        self.assertTrue(self.deal.is_closed)

        activity = self.deal.activities.filter(activity_type="column_change").first()
        self.assertIsNotNone(activity)
        self.assertEqual(activity.old_value, {"column": "Em Andamento"})
        self.assertEqual(activity.new_value, {"column": "Concluído"})

        notification = Notification.all_objects.filter(recipient=self.user, title="Card Movimentado").first()
        self.assertIsNotNone(notification)
        self.assertIn("coluna", notification.message.lower())
        self.assertIn("Concluído", notification.message)

        logger_info.assert_called_once()
        self.assertEqual(logger_info.call_args.args[0], "crm_deal_updated")
        self.assertEqual(
            logger_info.call_args.kwargs["extra"],
            {
                "deal_id": self.deal.id,
                "title": self.deal.title,
                "changed_fields": ["column"],
                "previous_legacy_stage_id": self.in_progress.id,
                "previous_legacy_stage_name": "Em Andamento",
                "previous_column_id": self.in_progress.column.id,
                "previous_column_title": "Em Andamento",
                "next_legacy_stage_id": self.done.id,
                "next_legacy_stage_name": "Concluído",
                "next_column_id": self.done.column.id,
                "next_column_title": "Concluído",
                "user_id": self.user.id,
                "company_id": self.company.id,
            },
        )

    def test_patch_column_updates_stage_legacy_automatically(self):
        response = self.client.patch(
            f"/api/crm/deals/{self.deal.id}/",
            {"column": self.done.column.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.column, self.done.column)
        self.assertEqual(self.deal.stage, self.done)
        self.assertTrue(self.deal.is_closed)
        self.assertEqual(response.data["column_id"], self.done.column.id)

    def test_create_deal_accepts_column_without_stage(self):
        response = self.client.post(
            "/api/crm/deals/",
            {
                "title": "Card por coluna",
                "contact": self.contact.id,
                "column": self.in_progress.column.id,
                "priority": "MEDIUM",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["column_id"], self.in_progress.column.id)

    def test_pipeline_endpoint_returns_nested_columns_and_cards(self):
        response = self.client.get(f"/api/crm/pipelines/{self.pipeline.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["columns"]), 4)
        progress_column = next(column for column in response.data["columns"] if column["title"] == "Em Andamento")
        self.assertEqual(progress_column["cards"][0]["id"], self.deal.id)
        self.assertEqual(progress_column["cards"][0]["column"], progress_column["id"])
        self.assertEqual(progress_column["cards"][0]["column_id"], progress_column["id"])
        self.assertEqual(progress_column["cards"][0]["column_title"], "Em Andamento")

    def test_pipeline_endpoint_can_omit_legacy_stage_fields_in_nested_cards(self):
        response = self.client.get(f"/api/crm/pipelines/{self.pipeline.id}/?omit_legacy_stage_fields=1")

        self.assertEqual(response.status_code, 200)
        progress_column = next(column for column in response.data["columns"] if column["title"] == "Em Andamento")
        self.assertNotIn("stage_legacy_id", progress_column["cards"][0])
        self.assertNotIn("stage_legacy_name", progress_column["cards"][0])
        self.assertEqual(progress_column["cards"][0]["column_id"], progress_column["id"])

    def test_deal_detail_exposes_column_as_primary_contract(self):
        response = self.client.get(f"/api/crm/deals/{self.deal.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("stage", response.data)
        self.assertEqual(response.data["column"], self.in_progress.column.id)
        self.assertEqual(response.data["column_id"], self.in_progress.column.id)
        self.assertEqual(response.data["column_title"], "Em Andamento")
        self.assertEqual(
            response.data["column_data"],
            {
                "id": self.in_progress.column.id,
                "pipeline": self.pipeline.id,
                "title": "Em Andamento",
                "order": self.in_progress.column.order,
                "color": self.in_progress.column.color,
                "column_kind": "active",
                "marks_done": False,
                "requires_schedule": False,
                "requires_assignee": False,
                "allowed_source_columns": [],
                "wip_limit": None,
                "legacy_stage": self.in_progress.id,
                "value_stream_phase": "demand",
            },
        )
        self.assertNotIn("X-Atlas-Deprecated", response)

    def test_deal_detail_no_longer_exposes_stage_aliases_by_default(self):
        response = self.client.get(f"/api/crm/deals/{self.deal.id}/")

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("stage", response.data)
        self.assertNotIn("stage_name", response.data)
        self.assertNotIn("stage_legacy_id", response.data)
        self.assertNotIn("stage_legacy_name", response.data)

    def test_deal_detail_can_include_legacy_stage_field_explicitly(self):
        response = self.client.get(f"/api/crm/deals/{self.deal.id}/?include_legacy_stage_fields=1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["stage"], self.in_progress.id)
        self.assertEqual(response["X-Atlas-Deprecated"], "true")
        self.assertIn("deal field 'stage'", response["X-Atlas-Deprecation-Message"])
        self.assertEqual(response.data["column_id"], self.in_progress.column.id)

    def test_patch_owner_reassigns_and_notifies_new_owner(self):
        response = self.client.patch(f"/api/crm/deals/{self.deal.id}/", {"owner": self.second_user.id}, format="json")

        self.assertEqual(response.status_code, 200)

        self.deal.refresh_from_db()
        self.assertEqual(self.deal.owner, self.second_user)

        activity = self.deal.activities.filter(activity_type="note").first()
        self.assertIsNotNone(activity)
        self.assertEqual(activity.old_value, {"owner": "tecnico"})
        self.assertEqual(activity.new_value, {"owner": "analista"})

        notification = Notification.all_objects.filter(recipient=self.second_user, title="Card Atribuído").first()
        self.assertIsNotNone(notification)
        self.assertIn(self.deal.title, notification.message)

    def test_post_note_creates_manual_update_activity(self):
        response = self.client.post(
            f"/api/crm/deals/{self.deal.id}/notes/",
            {"description": "Atualização operacional: aguardando retorno do cliente para liberar a execução."},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["id"], self.deal.id)
        activity = self.deal.activities.filter(activity_type="note").first()
        self.assertIsNotNone(activity)
        self.assertEqual(activity.description, "Atualização operacional: aguardando retorno do cliente para liberar a execução.")
        self.assertEqual(activity.actor, self.user)

    def test_patch_owner_rejects_user_from_another_company(self):
        response = self.client.patch(f"/api/crm/deals/{self.deal.id}/", {"owner": self.outsider.id}, format="json")

        self.assertEqual(response.status_code, 400)
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.owner, self.user)

    def test_patch_planned_stage_requires_schedule_and_technician(self):
        response = self.client.patch(f"/api/crm/deals/{self.deal.id}/", {"stage": self.planned.id}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("data_agendamento", response.data)
        self.assertIn("tecnico_responsavel", response.data)

    def test_patch_planned_column_keeps_semantics_after_rename(self):
        planned_column = self.planned.column
        planned_column.title = "Fila de Agenda"
        planned_column.save(update_fields=["title"])

        response = self.client.patch(
            f"/api/crm/deals/{self.deal.id}/",
            {"column": planned_column.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("data_agendamento", response.data)
        self.assertIn("tecnico_responsavel", response.data)

    def test_patch_done_column_marks_card_closed_after_rename(self):
        done_column = self.done.column
        done_column.title = "Finalizados do Sprint"
        done_column.save(update_fields=["title"])

        response = self.client.patch(
            f"/api/crm/deals/{self.deal.id}/",
            {"column": done_column.id},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.deal.refresh_from_db()
        self.assertEqual(self.deal.column, done_column)
        self.assertTrue(self.deal.is_closed)

    def test_patch_column_rejects_transition_outside_allowed_sources(self):
        target_column = self.done.column
        target_column.allowed_source_columns = [self.planned.column.id]
        target_column.save(update_fields=["allowed_source_columns"])

        response = self.client.patch(
            f"/api/crm/deals/{self.deal.id}/",
            {"column": target_column.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("column", response.data)
        self.assertIn("nao pode ser movido", str(response.data["column"][0]).lower())

    def test_patch_column_rejects_move_when_wip_limit_is_reached(self):
        target_column = self.done.column
        target_column.wip_limit = 1
        target_column.save(update_fields=["wip_limit"])
        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Outro card na coluna alvo",
            contact=self.contact,
            stage=self.done,
            column=target_column,
            value="100.00",
            priority="LOW",
        )

        response = self.client.patch(
            f"/api/crm/deals/{self.deal.id}/",
            {"column": target_column.id},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("column", response.data)
        self.assertIn("limite wip", str(response.data["column"][0]).lower())

    def test_patch_stage_triggers_n8n_webhook(self):
        tenant_module = TenantModule.all_objects.get(company=self.company, module=self.crm_module)
        tenant_module.config = {"integration": {"n8n_webhook_url": "https://n8n.example.com/webhook/crm"}}
        tenant_module.save(update_fields=["config"])

        with patch("apps.crm.services.requests.post") as requests_post:
            response = self.client.patch(f"/api/crm/deals/{self.deal.id}/", {"stage": self.done.id}, format="json")

        self.assertEqual(response.status_code, 200)
        requests_post.assert_called_once()
        self.assertEqual(
            requests_post.call_args.kwargs["json"],
            {
                "card_id": self.deal.id,
                "external_id": None,
                "new_column_title": "Concluído",
                "tenant_id": str(self.company.id),
                "previous_column_title": "Em Andamento",
                "integration_source": "manual",
            },
        )


class CRMPipelineOverviewApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        role = Role.all_objects.create(company=self.company, name="TestRole", permissions=["*"])
        self.user = User.objects.create_user(username="tecnico", password="password", company=self.company, role=role)
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )

        self.contact = Contact.objects.create(company=self.company, name="João Cliente", email="joao@cliente.com")
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        self.stage_new = Stage.all_objects.get(pipeline=self.pipeline, name="Novo")
        self.stage_planned = Stage.all_objects.get(pipeline=self.pipeline, name="Planejados")
        self.stage_progress = Stage.all_objects.get(pipeline=self.pipeline, name="Em Andamento")
        self.stage_done = Stage.all_objects.get(pipeline=self.pipeline, name="Concluído")

        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Servidor Offline",
            contact=self.contact,
            stage=self.stage_new,
            value="1500.00",
            closing_date=timezone.now() - timezone.timedelta(days=2),
            priority="URGENT",
            custom_fields={"progress_percentage": 25},
        )
        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Notebook Lento",
            contact=self.contact,
            stage=self.stage_progress,
            value="300.00",
            priority="MEDIUM",
            custom_fields={"progress_percentage": 80},
        )
        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Chamado Encerrado",
            contact=self.contact,
            stage=self.stage_done,
            value="200.00",
            priority="LOW",
            is_closed=True,
            custom_fields={"progress_percentage": 100},
        )

    def test_pipeline_overview_returns_summary_and_columns_by_default(self):
        response = self.client.get(f"/api/crm/pipelines/{self.pipeline.id}/overview/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["pipeline_id"], self.pipeline.id)
        self.assertEqual(response.data["pipeline_name"], self.pipeline.name)
        self.assertEqual(
            response.data["summary"],
            {
                "total_deals": 3,
                "total_value": "2000.00",
                "overdue": 1,
                "at_risk": 0,
                "done": 1,
                "average_progress": 68,
            },
        )
        expected_columns = [
            {
                "stage_id": self.stage_new.id,
                "column_id": self.stage_new.column.id,
                "column_title": "Novo",
                "name": "Novo",
                "total_deals": 1,
                "overdue": 1,
                "average_progress": 25,
            },
            {
                "stage_id": self.stage_planned.id,
                "column_id": self.stage_planned.column.id,
                "column_title": "Planejados",
                "name": "Planejados",
                "total_deals": 0,
                "overdue": 0,
                "average_progress": 0,
            },
            {
                "stage_id": self.stage_progress.id,
                "column_id": self.stage_progress.column.id,
                "column_title": "Em Andamento",
                "name": "Em Andamento",
                "total_deals": 1,
                "overdue": 0,
                "average_progress": 80,
            },
            {
                "stage_id": self.stage_done.id,
                "column_id": self.stage_done.column.id,
                "column_title": "Concluído",
                "name": "Concluído",
                "total_deals": 1,
                "overdue": 0,
                "average_progress": 100,
            },
        ]
        self.assertEqual(
            response.data["columns"],
            expected_columns,
        )
        self.assertNotIn("stages", response.data)
        self.assertNotIn("X-Atlas-Deprecated", response)

    def test_pipeline_overview_can_include_legacy_stages_explicitly(self):
        response = self.client.get(f"/api/crm/pipelines/{self.pipeline.id}/overview/?include_legacy_overview_stages=1")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["stages"],
            [
                {
                    "stage_id": self.stage_new.id,
                    "column_id": self.stage_new.column.id,
                    "column_title": "Novo",
                    "name": "Novo",
                    "total_deals": 1,
                    "overdue": 1,
                    "average_progress": 25,
                },
                {
                    "stage_id": self.stage_planned.id,
                    "column_id": self.stage_planned.column.id,
                    "column_title": "Planejados",
                    "name": "Planejados",
                    "total_deals": 0,
                    "overdue": 0,
                    "average_progress": 0,
                },
                {
                    "stage_id": self.stage_progress.id,
                    "column_id": self.stage_progress.column.id,
                    "column_title": "Em Andamento",
                    "name": "Em Andamento",
                    "total_deals": 1,
                    "overdue": 0,
                    "average_progress": 80,
                },
                {
                    "stage_id": self.stage_done.id,
                    "column_id": self.stage_done.column.id,
                    "column_title": "Concluído",
                    "name": "Concluído",
                    "total_deals": 1,
                    "overdue": 0,
                    "average_progress": 100,
                },
            ],
        )
        self.assertEqual(response.data["columns"], response.data["stages"])
        self.assertEqual(response["X-Atlas-Deprecated"], "true")
        self.assertIn("overview field 'stages' is deprecated", response["X-Atlas-Deprecation-Message"])

    def test_pipeline_overview_uses_done_semantics_after_column_rename(self):
        done_column = self.stage_done.column
        done_column.title = "Finalizados do Sprint"
        done_column.save(update_fields=["title"])

        response = self.client.get(f"/api/crm/pipelines/{self.pipeline.id}/overview/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["done"], 1)
        done_payload = next(column for column in response.data["columns"] if column["column_id"] == done_column.id)
        self.assertEqual(done_payload["column_title"], "Finalizados do Sprint")
        self.assertEqual(done_payload["name"], "Finalizados do Sprint")


class CRMIntegrationSyncCardApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        self.user = User.objects.create_user(username="tecnico", password="password", company=self.company)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        self.first_column = Column.all_objects.filter(company=self.company, pipeline=self.pipeline).order_by("order", "id").first()

        raw_key = APIKey.generate_raw_key()
        self.api_key = APIKey.objects.create(
            company=self.company,
            name="Integração n8n",
            prefix="crmtestapikey001",
            hashed_key="",
            scopes=["crm.sync_card", "crm.glpi_ticket"],
        )
        self.api_key.set_key(raw_key)
        self.api_key.save(update_fields=["hashed_key"])
        self.raw_api_key = f"{self.api_key.prefix}.{raw_key}"

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_sync_card_creates_card_in_first_column(self, _update_last_used):
        response = self.client.post(
            "/api/v1/integration/sync-card/",
            {
                "pipeline_id": self.pipeline.id,
                "external_id": "GLPI-123",
                "title": "Ticket GLPI Importado",
                "integration_source": "glpi",
            },
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

        self.assertEqual(response.status_code, 201)
        deal = Deal.all_objects.get(external_id="GLPI-123")
        self.assertEqual(deal.column, self.first_column)
        self.assertEqual(deal.stage, self.first_column.legacy_stage)
        self.assertEqual(deal.integration_source, "glpi")

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_sync_card_updates_existing_card(self, _update_last_used):
        deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            contact=Contact.objects.create(company=self.company, name="Contato GLPI"),
            stage=self.first_column.legacy_stage,
            column=self.first_column,
            title="Ticket Antigo",
            external_id="GLPI-123",
        )

        response = self.client.post(
            "/api/v1/integration/sync-card/",
            {
                "pipeline_id": self.pipeline.id,
                "external_id": "GLPI-123",
                "title": "Ticket Atualizado",
                "priority": "HIGH",
                "integration_source": "glpi",
            },
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

        self.assertEqual(response.status_code, 200)
        deal.refresh_from_db()
        self.assertEqual(deal.title, "Ticket Atualizado")
        self.assertEqual(deal.priority, "HIGH")

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_sync_card_accepts_column_id_as_primary_target(self, _update_last_used):
        done_column = Column.all_objects.filter(company=self.company, pipeline=self.pipeline, title="Concluído").first()

        response = self.client.post(
            "/api/v1/integration/sync-card/",
            {
                "pipeline_id": self.pipeline.id,
                "column_id": done_column.id,
                "external_id": "GLPI-999",
                "title": "Ticket Finalizado",
                "integration_source": "glpi",
            },
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("stage", response.data)
        self.assertEqual(response.data["column_id"], done_column.id)
        self.assertEqual(response.data["column_title"], "Concluído")
        self.assertNotIn("X-Atlas-Deprecated", response)

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_sync_card_can_include_legacy_stage_field_explicitly(self, _update_last_used):
        done_column = Column.all_objects.filter(company=self.company, pipeline=self.pipeline, title="Concluído").first()

        response = self.client.post(
            "/api/v1/integration/sync-card/?include_legacy_stage_fields=1",
            {
                "pipeline_id": self.pipeline.id,
                "column_id": done_column.id,
                "external_id": "GLPI-1000",
                "title": "Ticket Sem Stage Legado",
                "integration_source": "glpi",
            },
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["stage"], done_column.legacy_stage_id)
        self.assertNotIn("stage_name", response.data)
        self.assertNotIn("stage_legacy_id", response.data)
        self.assertNotIn("stage_legacy_name", response.data)
        self.assertEqual(response["X-Atlas-Deprecated"], "true")
        self.assertEqual(response.data["column_id"], done_column.id)


class CRMIntegrationGLPITicketWebhookApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        self.user = User.objects.create_user(username="tecnico", password="password", company=self.company)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        self.tenant_module, _ = TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        self.first_column = Column.all_objects.filter(company=self.company, pipeline=self.pipeline).order_by("order", "id").first()
        self.tenant_module.config = {"integration": {"glpi": {"pipeline_id": self.pipeline.id}}}
        self.tenant_module.save(update_fields=["config"])

        raw_key = APIKey.generate_raw_key()
        self.api_key = APIKey.objects.create(
            company=self.company,
            name="Integração n8n GLPI",
            prefix="crmtestapikeyglpi1",
            hashed_key="",
            scopes=["crm.sync_card", "crm.glpi_ticket"],
        )
        self.api_key.set_key(raw_key)
        self.api_key.save(update_fields=["hashed_key"])
        self.raw_api_key = f"{self.api_key.prefix}.{raw_key}"

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_glpi_webhook_creates_card_using_module_config_pipeline(self, _update_last_used):
        response = self.client.post(
            "/api/v1/integration/glpi/tickets/",
            {
                "ticket_id": "123",
                "title": "Chamado GLPI",
                "description": "Descrição do chamado",
                "priority_level": 4,
                "requester": {"name": "Alice", "email": "alice@example.com"},
            },
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

        self.assertEqual(response.status_code, 201)
        deal = Deal.all_objects.get(external_id="glpi:123")
        self.assertEqual(deal.column, self.first_column)
        self.assertEqual(deal.priority, "HIGH")
        self.assertEqual(deal.integration_source, "glpi")
        self.assertEqual(deal.contact.email, "alice@example.com")

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_glpi_webhook_requires_signature_when_secret_is_configured_for_api_key(self, _update_last_used):
        self.tenant_module.config = {"integration": {"glpi": {"pipeline_id": self.pipeline.id, "secret": "testsecret"}}}
        self.tenant_module.save(update_fields=["config"])

        payload = {
            "ticket_id": "124",
            "title": "Chamado GLPI Assinado",
        }
        raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        signature = hmac.new(b"testsecret", msg=raw_body, digestmod=hashlib.sha256).hexdigest()

        unauthorized = self.client.post(
            "/api/v1/integration/glpi/tickets/",
            payload,
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )
        self.assertEqual(unauthorized.status_code, 401)

        ok = self.client.post(
            "/api/v1/integration/glpi/tickets/",
            raw_body,
            content_type="application/json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
            HTTP_X_INTEGRATION_SIGNATURE=f"sha256={signature}",
        )
        self.assertIn(ok.status_code, (200, 201))

    @patch("apps.api_keys.tasks.update_api_key_last_used.delay")
    def test_glpi_webhook_is_idempotent_by_external_id(self, _update_last_used):
        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            contact=Contact.objects.create(company=self.company, name="Contato GLPI", email="alice@example.com"),
            stage=self.first_column.legacy_stage,
            column=self.first_column,
            title="Antigo",
            external_id="glpi:123",
            integration_source="glpi",
        )

        response = self.client.post(
            "/api/v1/integration/glpi/tickets/",
            {
                "ticket_id": "123",
                "title": "Atualizado",
                "priority": "URGENT",
            },
            format="json",
            HTTP_X_API_KEY=self.raw_api_key,
            HTTP_X_COMPANY_SLUG=self.company.slug,
        )

        self.assertEqual(response.status_code, 200)
        deal = Deal.all_objects.get(external_id="glpi:123")
        self.assertEqual(deal.title, "Atualizado")
        self.assertEqual(deal.priority, "URGENT")


class CRMIntegrationOptionsApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        role = Role.all_objects.create(company=self.company, name="Admin", permissions=["admin.settings_manage", "crm.deal_view"])
        self.user = User.objects.create_user(username="admin", password="password", company=self.company, role=role)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        Column.all_objects.filter(company=self.company, pipeline=self.pipeline).order_by("order", "id").first()
        Contact.objects.create(company=self.company, name="Contato", email="contato@example.com")

    def test_integration_options_returns_lists(self):
        response = self.client.get("/api/crm/integrations/options/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("pipelines", response.data)
        self.assertIn("columns", response.data)
        self.assertIn("users", response.data)
        self.assertIn("contacts", response.data)


class CRMIntegrationInboundEventsApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        role = Role.all_objects.create(company=self.company, name="Admin", permissions=["admin.settings_manage", "crm.deal_view"])
        self.user = User.objects.create_user(username="admin", password="password", company=self.company, role=role)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

    def test_inbound_events_lists_latest(self):
        IntegrationInboundEvent.all_objects.create(
            company=self.company,
            source="glpi",
            event_type="ticket.upsert",
            external_id="glpi:123",
            request_payload={"ticket_id": "123"},
            status=IntegrationInboundStatus.PROCESSED,
            response_status_code=201,
        )

        response = self.client.get("/api/crm/integrations/inbound/?source=glpi")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["external_id"], "glpi:123")


class CRMIntegrationInboundEventReplayApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        role = Role.all_objects.create(company=self.company, name="Admin", permissions=["admin.settings_manage", "crm.deal_view"])
        self.user = User.objects.create_user(username="admin", password="password", company=self.company, role=role)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        self.tenant_module, _ = TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")
        self.first_column = Column.all_objects.filter(company=self.company, pipeline=self.pipeline).order_by("order", "id").first()
        self.tenant_module.config = {"integration": {"glpi": {"pipeline_id": self.pipeline.id}}}
        self.tenant_module.save(update_fields=["config"])

        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

    def test_replay_creates_new_event_and_updates_deal(self):
        original = IntegrationInboundEvent.all_objects.create(
            company=self.company,
            source="glpi",
            event_type="ticket.upsert",
            external_id="glpi:777",
            request_payload={"ticket_id": "777", "title": "Replay Ticket"},
            status=IntegrationInboundStatus.FAILED,
            response_status_code=500,
            error="Falha simulada",
        )

        response = self.client.post(f"/api/crm/integrations/inbound/{original.id}/replay/")
        self.assertIn(response.status_code, (200, 201))
        self.assertEqual(response.data["external_id"], "glpi:777")
        self.assertEqual(response.data["column_id"], self.first_column.id)

        replay = IntegrationInboundEvent.all_objects.filter(company=self.company, replayed_from=original).order_by("-id").first()
        self.assertIsNotNone(replay)
        self.assertEqual(replay.status, IntegrationInboundStatus.PROCESSED)


class CRMSavedViewApiTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="TI Solutions", slug="ti-solutions")
        role = Role.all_objects.create(company=self.company, name="TestRole", permissions=["*"])
        self.user = User.objects.create_user(username="tecnico", password="password", company=self.company, role=role)
        self.other_user = User.objects.create_user(username="analista", password="password", company=self.company, role=role)
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        self.crm_module, _ = Module.objects.get_or_create(
            code="crm",
            defaults={"name": "CRM", "description": "Gestão comercial e de cards"},
        )
        TenantModule.objects.get_or_create(
            company=self.company,
            module=self.crm_module,
            defaults={"is_active": True},
        )
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte TI")

    def test_list_saved_views_filters_by_pipeline_and_owner(self):
        own_view = CRMSavedView.all_objects.create(
            company=self.company,
            owner=self.user,
            pipeline=self.pipeline,
            name="Minha fila",
            view_mode="list",
            filters={"priority": "URGENT"},
        )
        other_pipeline = Pipeline.all_objects.create(company=self.company, name="Comercial")
        CRMSavedView.all_objects.create(
            company=self.company,
            owner=self.user,
            pipeline=other_pipeline,
            name="Outra view",
        )
        CRMSavedView.all_objects.create(
            company=self.company,
            owner=self.other_user,
            pipeline=self.pipeline,
            name="View alheia",
        )

        response = self.client.get(f"/api/crm/saved-views/?pipeline_id={self.pipeline.id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_view.id)
        self.assertEqual(response.data[0]["name"], "Minha fila")

    def test_create_saved_view_persists_filters_sorting_and_visibility(self):
        response = self.client.post(
            "/api/crm/saved-views/",
            {
                "pipeline": self.pipeline.id,
                "name": "Visão operacional",
                "view_mode": "list",
                "filters": {
                    "stageFilter": "all",
                    "priorityFilter": "URGENT",
                    "ownerFilter": "all",
                    "titleSearch": "firewall",
                },
                "sorting": [{"id": "priority", "desc": True}],
                "column_visibility": {"value": False},
                "is_default": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        saved_view = CRMSavedView.all_objects.get(id=response.data["id"])
        self.assertEqual(saved_view.company, self.company)
        self.assertEqual(saved_view.owner, self.user)
        self.assertEqual(saved_view.pipeline, self.pipeline)
        self.assertEqual(saved_view.filters["priorityFilter"], "URGENT")
        self.assertEqual(saved_view.sorting, [{"id": "priority", "desc": True}])
        self.assertEqual(saved_view.column_visibility, {"value": False})
        self.assertTrue(saved_view.is_default)

    def test_updating_default_saved_view_unsets_previous_default(self):
        first_default = CRMSavedView.all_objects.create(
            company=self.company,
            owner=self.user,
            pipeline=self.pipeline,
            name="Default atual",
            is_default=True,
        )
        second_view = CRMSavedView.all_objects.create(
            company=self.company,
            owner=self.user,
            pipeline=self.pipeline,
            name="Nova default",
            is_default=False,
        )

        response = self.client.patch(
            f"/api/crm/saved-views/{second_view.id}/",
            {"is_default": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        first_default.refresh_from_db()
        second_view.refresh_from_db()
        self.assertFalse(first_default.is_default)
        self.assertTrue(second_view.is_default)
