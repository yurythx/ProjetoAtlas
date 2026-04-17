from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.core.models import Company
from apps.crm.models import Deal, Pipeline, Stage, Swarm, Column, Contact
from apps.module_manager.models import Module, TenantModule
from rest_framework.test import APIClient, APITestCase

User = get_user_model()

class SwarmLogicTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Atlas Test", slug="atlas-test")
        self.user = User.objects.create_user(username="tech", password="password", company=self.company)
        
        # Enable CRM
        crm_mod, _ = Module.objects.get_or_create(code="crm", defaults={"name": "CRM"})
        TenantModule.all_objects.create(company=self.company, module=crm_mod, is_active=True)
        
        self.pipeline = Pipeline.all_objects.create(company=self.company, name="Test Pipeline")
        self.stage = Stage.all_objects.get(pipeline=self.pipeline, name="Novo")
        self.column = Column.all_objects.get(pipeline=self.pipeline, title="Novo")
        
        # Create Contact (Required for Deal)
        self.contact = Contact.objects.create(company=self.company, name="Test Client", email="test@client.com")
        
        self.deal = Deal.all_objects.create(
            company=self.company,
            title="SLA Risk Card",
            stage=self.stage,
            column=self.column,
            owner=self.user,
            contact=self.contact
        )
        
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

    def test_start_swarm_creates_swarm_and_messenger_war_room(self):
        """Testa se o action start_swarm cria o objeto Swarm e inicia o War Room."""
        response = self.client.post(f"/api/crm/deals/{self.deal.id}/start_swarm/")
        self.assertEqual(response.status_code, 200)
        
        # O serializer agora deve incluir informações do swarm
        self.assertIn("swarm", response.data)
        
        # Verifica se o swarm existe no DB
        swarm = Swarm.all_objects.filter(deal=self.deal, is_active=True).first()
        self.assertIsNotNone(swarm)
        self.assertIsNotNone(swarm.conversation_id)
        
    def test_end_swarm_terminates_session(self):
        """Testa se o action end_swarm (url_path='end-swarm') encerra a colaboração."""
        # Setup: Inicia um swarm
        Swarm.all_objects.create(deal=self.deal, is_active=True, company=self.company)
        
        # Nota: url_path="end-swarm" no DealViewSet
        response = self.client.post(f"/api/crm/deals/{self.deal.id}/end-swarm/")
        self.assertEqual(response.status_code, 200)
        
        # Verifica se foi desativado
        swarm = Swarm.all_objects.filter(deal=self.deal, is_active=True).first()
        self.assertIsNone(swarm)
