from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company
from apps.finance.models import Transaction
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class FinanceTransactionScopeTest(APITestCase):
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

    def test_user_can_create_own_transaction(self):
        payload = {
            "description": "Despesa pessoal",
            "amount": "10.00",
            "type": "out",
            "status": "pending",
            "due_date": "2026-03-10",
            "competence_date": "2026-03-10",
        }
        res = self.client.post("/api/finance/transactions/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["created_by"], self.user.id)

    def test_user_list_is_scoped_to_self(self):
        Transaction.objects.create(
            company=self.company,
            description="Other",
            amount="10.00",
            type="out",
            status="pending",
            due_date="2026-03-10",
            competence_date="2026-03-10",
            created_by=self.other,
        )
        Transaction.objects.create(
            company=self.company,
            description="Mine",
            amount="11.00",
            type="out",
            status="pending",
            due_date="2026-03-10",
            competence_date="2026-03-10",
            created_by=self.user,
        )

        res = self.client.get("/api/finance/transactions/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["description"], "Mine")

    def test_user_cannot_update_other_users_transaction(self):
        tx = Transaction.objects.create(
            company=self.company,
            description="Other",
            amount="10.00",
            type="out",
            status="pending",
            due_date="2026-03-10",
            competence_date="2026-03-10",
            created_by=self.other,
        )
        res = self.client.patch(f"/api/finance/transactions/{tx.id}/", {"description": "hack"}, format="json")
        self.assertIn(res.status_code, (status.HTTP_404_NOT_FOUND, status.HTTP_400_BAD_REQUEST))

    def test_user_cannot_update_paid_transaction(self):
        tx = Transaction.objects.create(
            company=self.company,
            description="Mine",
            amount="10.00",
            type="out",
            status="paid",
            due_date="2026-03-10",
            competence_date="2026-03-10",
            payment_date="2026-03-10",
            created_by=self.user,
        )
        res = self.client.patch(f"/api/finance/transactions/{tx.id}/", {"description": "edit"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class FinanceCategoryScopeTest(APITestCase):
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

    def test_user_can_create_personal_category(self):
        payload = {"name": "Pessoal", "description": "Minhas coisas", "color": "#000000"}
        res = self.client.post("/api/finance/categories/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["created_by"], self.user.id)
        self.assertEqual(res.data["is_shared"], False)

    def test_user_list_sees_shared_and_own_only(self):
        from apps.finance.models import Category

        Category.objects.create(
            company=self.company,
            name="Empresa",
            description="Shared",
            color="#111111",
            is_shared=True,
        )
        Category.objects.create(
            company=self.company,
            name="Outro",
            description="Other personal",
            color="#222222",
            is_shared=False,
            created_by=self.other,
        )
        Category.objects.create(
            company=self.company,
            name="Meu",
            description="Mine personal",
            color="#333333",
            is_shared=False,
            created_by=self.user,
        )

        res = self.client.get("/api/finance/categories/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        names = {x["name"] for x in data}
        self.assertIn("Empresa", names)
        self.assertIn("Meu", names)
        self.assertNotIn("Outro", names)
