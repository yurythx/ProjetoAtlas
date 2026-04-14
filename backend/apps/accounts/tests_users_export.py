from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company

User = get_user_model()


class UsersExportTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Export Corp", slug="export-corp")
        # Usuário sem permissão (para testar o 403)
        self.user = User.objects.create_user(
            username="admin", email="admin@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="export-corp")
        member_role = Role.objects.create(company=self.company, name="Member")
        User.objects.create_user(
            username="u1", email="u1@corp.com", password="pass", company=self.company, role=member_role
        )
        User.objects.create_user(username="u2", email="u2@corp.com", password="pass", company=self.company)
        # Role com permissão admin.user_manage (para testar o 200)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])

    def test_export_requires_permission(self):
        # Usuário sem permissão — deve receber 403
        res_forbidden = self.client.get("/api/accounts/users/export/")
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)
        # Atribui role com permissão ao usuário
        self.user.role = self.admin_role
        self.user.save(update_fields=["role"])
        res_ok = self.client.get("/api/accounts/users/export/")
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", res_ok.headers.get("Content-Type", ""))
        body = res_ok.content.decode()
        self.assertTrue(body.startswith("username,email"))
        self.assertIn("u1,u1@corp.com", body)
        self.assertIn("u2,u2@corp.com", body)
