from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule
from apps.payroll.models import EarningEvent

User = get_user_model()


class PayrollEarningEventScopeTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        self.user = User.all_objects.create_user(
            username="u1",
            email="u1@test.corp",
            password="pass",
            company=self.company,
        )
        self.other = User.all_objects.create_user(
            username="u2",
            email="u2@test.corp",
            password="pass",
            company=self.company,
        )

        self.mod_finance = Module.objects.create(code="finance", name="Financeiro")
        TenantModule.objects.create(company=self.company, module=self.mod_finance, is_active=True)

        role, _ = Role.objects.get_or_create(
            company=self.company,
            name="ReaderFinance",
            defaults={"permissions": ["finance.view_financial"]},
        )
        self.user.role = role
        self.user.save(update_fields=["role"])

        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="test-corp")

    def test_user_can_create_own_event(self):
        payload = {
            "kind": "daily",
            "user": self.user.id,
            "competence_date": "2026-03-10",
            "amount": "100.00",
            "payout_mode": "weekly",
        }
        res = self.client.post("/api/payroll/events/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_user_cannot_create_event_for_other_user(self):
        payload = {
            "kind": "daily",
            "user": self.other.id,
            "competence_date": "2026-03-10",
            "amount": "100.00",
            "payout_mode": "weekly",
        }
        res = self.client.post("/api/payroll/events/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_list_is_scoped_to_self(self):
        EarningEvent.objects.create(
            company=self.company,
            kind="daily",
            user=self.other,
            competence_date="2026-03-10",
            amount="50.00",
            payout_mode="weekly",
            created_by=self.other,
        )
        EarningEvent.objects.create(
            company=self.company,
            kind="daily",
            user=self.user,
            competence_date="2026-03-10",
            amount="60.00",
            payout_mode="weekly",
            created_by=self.user,
        )
        res = self.client.get("/api/payroll/events/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        ids = [x["id"] for x in data]
        self.assertEqual(len(ids), 1)

    def test_user_cannot_update_assigned_event(self):
        ev = EarningEvent.objects.create(
            company=self.company,
            kind="daily",
            user=self.user,
            competence_date="2026-03-10",
            amount="60.00",
            payout_mode="weekly",
            created_by=self.user,
            status="assigned",
        )
        res = self.client.patch(f"/api/payroll/events/{ev.id}/", {"amount": "70.00"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
