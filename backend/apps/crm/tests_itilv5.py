import json
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient, APITestCase
from apps.core.models import Company
from apps.crm.models import (
    Column,
    Contact,
    Deal,
    Pipeline,
    XLAFeedback,
)
from apps.module_manager.models import Module, TenantModule

User = get_user_model()

class ITILV5AnalyticsTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Atlas Enterprise", slug="atlas-ent")
        self.user = User.objects.create_user(username="manager", password="password", company=self.company)
        
        # Ativar módulo CRM
        crm_module, _ = Module.objects.get_or_create(code="crm", defaults={"name": "CRM"})
        TenantModule.objects.get_or_create(company=self.company, module=crm_module, defaults={"is_active": True})

        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

        # Setup VSM Pipeline
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Service Value Stream")
        self.column_backlog = Column.all_objects.get(pipeline=self.pipeline, title="Novo")
        self.column_done = Column.all_objects.get(pipeline=self.pipeline, title="Concluído")
        
        self.contact = Contact.objects.create(company=self.company, name="Test User")

        # Criar cards finalizados para métricas VSM
        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Incidente Resolvido",
            contact=self.contact,
            column=self.column_done,
            stage=self.column_done.legacy_stage,
            is_closed=True,
            created_at=timezone.now() - timezone.timedelta(days=5),
            updated_at=timezone.now()
        )

    def test_vsm_analytics_endpoint(self):
        response = self.client.get(f"/api/crm/dpsm-dashboard/vsm_analytics/?pipeline_id={self.pipeline.id}")
        self.assertEqual(response.status_code, 200)
        self.assertIn("avg_lead_time_days", response.data)
        self.assertGreaterEqual(response.data["avg_lead_time_days"], 0)
        self.assertIn("residence_times", response.data)

    def test_governance_reports_endpoint(self):
        # Gerar um feedback XLA
        deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Card de Feedback",
            contact=self.contact,
            column=self.column_done,
            stage=self.column_done.legacy_stage
        )
        
        XLAFeedback.objects.create(
            company=self.company,
            deal=deal, 
            contact=self.contact,
            rating=9,
            ease_of_use=8,
            speed_satisfaction=9,
            outcome_satisfaction=10
        )
        
        response = self.client.get("/api/crm/dpsm-dashboard/governance_reports/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("sla_compliance_rate", response.data)
        self.assertIn("xla_experience", response.data)
        self.assertEqual(response.data["xla_experience"]["avg_ease"], 8.0)

    def test_topology_endpoint(self):
        deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Crise de TI",
            contact=self.contact,
            column=self.column_backlog,
            stage=self.column_backlog.legacy_stage
        )
        response = self.client.get(f"/api/crm/deals/{deal.id}/topology/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("nodes", response.data)
        self.assertIn("links", response.data)
        # Deve ter ao menos o nó do Deal
        self.assertTrue(any(n["type"] == "deal" for n in response.data["nodes"]))
