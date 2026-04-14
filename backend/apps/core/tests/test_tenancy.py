from django.test import TestCase

from apps.accounts.models import User
from apps.core.models import Company
from shared_kernel.tenant_context import set_current_company


class TenantIsolationTest(TestCase):
    def setUp(self):
        # Criar duas empresas
        self.company_a = Company.objects.create(name="Company A", slug="comp-a")
        self.company_b = Company.objects.create(name="Company B", slug="comp-b")

        # Criar usuários para cada empresa (manualmente passando company, pois contexto não está setado no setup)
        # Nota: BaseTenantModel requer 'company'.
        self.user_a = User.objects.create_user(username="user_a", password="password", company=self.company_a)
        self.user_b = User.objects.create_user(username="user_b", password="password", company=self.company_b)

    def test_manager_isolation(self):
        """Testa se o TenantManager filtra corretamente baseada no contexto."""

        # Cenário 1: Sem contexto definido -> deve retornar vazio (fallback seguro)
        set_current_company(None)
        self.assertEqual(User.objects.count(), 0)

        # Cenário 2: Contexto Company A -> deve ver apenas user_a
        set_current_company(self.company_a)
        qs_a = User.objects.all()
        self.assertEqual(qs_a.count(), 1)
        self.assertEqual(qs_a.first(), self.user_a)

        # Cenário 3: Contexto Company B -> deve ver apenas user_b
        set_current_company(self.company_b)
        qs_b = User.objects.all()
        self.assertEqual(qs_b.count(), 1)
        self.assertEqual(qs_b.first(), self.user_b)

    def test_all_objects_access(self):
        """Testa se all_objects permite acesso global."""
        # all_objects é o manager padrão do Django (sem filtro) se configurado
        # No BaseTenantModel definimos: objects = TenantManager(), all_objects = models.Manager()

        self.assertEqual(User.all_objects.count(), 2)
