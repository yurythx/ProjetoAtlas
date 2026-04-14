from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.models import AuditLog, Company


class OnboardingLogicTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(name="New SaaS", slug="new-saas")
        self.role = Role.objects.create(name="Admin", company=self.company, permissions=["admin.settings_manage"])
        self.user = User.objects.create_user(username="admin", password="password", company=self.company, is_staff=True, role=self.role)
        self.client.force_authenticate(user=self.user)

    def test_initial_onboarding_state(self):
        """Verifica se uma nova empresa começa com onboarding incompleto."""
        self.assertFalse(self.company.onboarding_completed)
        self.assertEqual(self.company.onboarding_step, 1)

    def test_complete_onboarding_action(self):
        """Testa se o endpoint marca o onboarding como concluído e loga no AuditLog."""
        # Definir contexto via header para o middleware identificar o tenant
        response = self.client.post("/api/core/companies/complete_onboarding/", HTTP_X_COMPANY_SLUG="new-saas")

        self.assertEqual(response.status_code, 200)

        self.company.refresh_from_db()
        self.assertTrue(self.company.onboarding_completed)

        # Verificar log de auditoria
        log_exists = AuditLog.objects.filter(
            company=self.company, action="update", resource="Company", details__message="Onboarding completed"
        ).exists()
        self.assertTrue(log_exists)
