from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from apps.core.models import Company
from apps.crm.models import (
    Column,
    Contact,
    Deal,
    Pipeline,
    MetricSnapshot,
    DealActivity
)
from apps.crm.tasks import analyze_deal_ai_metadata, capture_crm_metrics_snapshot

User = get_user_model()

class ITILAutomationTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Atlas Automation", slug="atlas-auto")
        self.user = User.objects.create_user(username="bot", password="password", company=self.company)
        
        # Setup Pipeline
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Automated VSM")
        self.column = Column.all_objects.get(pipeline=self.pipeline, title="Novo")
        self.contact = Contact.objects.create(company=self.company, name="Bot User")

    def test_ai_metadata_pipeline_task(self):
        """Testa se a tarefa de IA calcula corretamente o score de risco."""
        # 1. Create a deal at risk (SLA near breach)
        deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="High Risk Incident",
            contact=self.contact,
            column=self.column,
            stage=self.column.legacy_stage,
            priority="HIGH",
            closing_date=timezone.now() + timezone.timedelta(hours=1),
            sla_status="at_risk"
        )
        
        # 2. Run task synchronously
        analyze_deal_ai_metadata(deal.id)
        
        # 3. Refresh and verify metadata
        deal.refresh_from_db()
        metadata = deal.ai_metadata
        self.assertIn("risk_score", metadata)
        self.assertGreater(metadata["risk_score"], 0)
        self.assertIn("risk_factors", metadata)
        # Deve ter detectado risco de SLA
        self.assertTrue(any("SLA" in f for f in metadata["risk_factors"]))

    def test_stagnation_detection_in_ai_task(self):
        """Testa se a IA detecta estagnação (residence time)."""
        deal = Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Stalled Task",
            contact=self.contact,
            column=self.column,
            stage=self.column.legacy_stage,
            created_at=timezone.now() - timezone.timedelta(days=10)
        )
        
        # Simula uma atividade de mudança de coluna antiga
        DealActivity.objects.create(
            company=self.company,
            deal=deal,
            activity_type="column_change",
            description="Entrou na coluna",
            created_at=timezone.now() - timezone.timedelta(days=10)
        )
        
        analyze_deal_ai_metadata(deal.id)
        deal.refresh_from_db()
        
        self.assertTrue(any("Estagnação" in f for f in deal.ai_metadata["risk_factors"]))
        self.assertGreaterEqual(deal.ai_metadata["risk_score"], 30)

    def test_metric_snapshot_capture(self):
        """Testa se o snapshot de métricas diárias é gerado corretamente."""
        # 1. Create some data
        Deal.all_objects.create(
            company=self.company,
            owner=self.user,
            title="Finished Task",
            contact=self.contact,
            column=self.column,
            stage=self.column.legacy_stage,
            is_closed=True,
            created_at=timezone.now() - timezone.timedelta(days=2),
            updated_at=timezone.now()
        )
        
        # 2. Run snapshot task
        capture_crm_metrics_snapshot()
        
        # 3. Verify snapshot was created
        snapshot = MetricSnapshot.all_objects.filter(pipeline=self.pipeline).first()
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.active_deals_count, 0) # Só temos deals fechados
        self.assertGreaterEqual(snapshot.throughput_weekly, 1)
        self.assertEqual(snapshot.date, timezone.now().date())
