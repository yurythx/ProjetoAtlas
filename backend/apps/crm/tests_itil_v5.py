from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from apps.core.models import Company
from apps.service_catalog.models import ServiceCategory, ServiceDefinition, ServiceItem
from apps.crm.models import SLAPolicy
from apps.accounts.models import Role
from apps.module_manager.models import Module, TenantModule

User = get_user_model()

class ITILv5GovernanceAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Atlas Gov Corp", slug="atlas-gov")
        
        # Garante que os módulos necessários existam e estejam ativos
        self.crm_module, _ = Module.objects.get_or_create(code="crm", defaults={"name": "CRM"})
        self.sc_module, _ = Module.objects.get_or_create(code="service_catalog", defaults={"name": "Service Catalog"})
        
        TenantModule.objects.get_or_create(company=self.company, module=self.crm_module, defaults={"is_active": True})
        TenantModule.objects.get_or_create(company=self.company, module=self.sc_module, defaults={"is_active": True})

        # Cria papel com permissão total para o admin
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["*"])
        
        self.user = User.objects.create_user(
            username="admin-gov", 
            password="password", 
            company=self.company,
            role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

    def test_create_sla_policy(self):
        """Garante que a criação de política de SLA funciona e persiste corretamente."""
        data = {
            "name": "SLA Crítico - ITIL v5",
            "target_response_minutes": 15,
            "target_resolution_minutes": 120,
            "business_hours_only": True
        }
        response = self.client.post("/api/crm/sla-policies/", data)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(SLAPolicy.objects.filter(company=self.company).count(), 1)

    def test_service_catalog_isolation(self):
        """Garante que itens de catálogo de uma empresa não vazam para outra."""
        # Empresa A
        cat = ServiceCategory.objects.create(company=self.company, name="TI")
        defn = ServiceDefinition.objects.create(company=self.company, category=cat, name="Suporte")
        ServiceItem.objects.create(company=self.company, definition=defn, name="Reset de Senha")

        # Empresa B
        other_company = Company.objects.create(name="Outra", slug="outra")
        other_user = User.objects.create_user(username="other", password="pass", company=other_company)
        
        # Módulo não ativo para Empresa B por padrão
        self.client.force_authenticate(user=other_user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=other_company.slug)
        
        # Deve retornar 200 OK mas com a lista vazia (Isolamento de Tenant)
        response = self.client.get("/api/service-catalog/items/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data.get("results", [])), 0)

    def test_itil_record_type_choices(self):
        """Valida se os tipos de registro seguem o padrão ITIL v5."""
        cat = ServiceCategory.objects.create(company=self.company, name="TI")
        defn = ServiceDefinition.objects.create(company=self.company, category=cat, name="Suporte")
        
        data = {
            "definition": defn.id,
            "name": "Novo Incidente",
            "record_type": "incident",
            "estimated_cost": "50.00"
        }
        response = self.client.post("/api/service-catalog/items/", data)
        # O endpoint correto é /api/service-catalog/items/
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["record_type"], "incident")
