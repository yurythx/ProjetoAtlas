from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company

User = get_user_model()


class UserSuperadminSecurityTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Co", slug="test")

        self.superadmin1 = User.objects.create_superuser(
            username="super1", email="s1@test.com", password="password", company=self.company
        )
        self.superadmin2 = User.objects.create_superuser(
            username="super2", email="s2@test.com", password="password", company=self.company
        )

        self.admin_role = Role.objects.create(name="Admin", company=self.company, permissions=["admin.user_manage"])
        self.regular_admin = User.objects.create_user(
            username="admin", email="a@test.com", password="password", company=self.company, role=self.admin_role
        )

    def test_superadmin_can_edit_another_superadmin(self):
        self.client.force_authenticate(user=self.superadmin1)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        data = {"first_name": "Updated"}
        response = self.client.patch(f"/api/accounts/users/{self.superadmin2.id}/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.superadmin2.refresh_from_db()
        self.assertEqual(self.superadmin2.first_name, "Updated")

    def test_regular_admin_cannot_edit_superadmin(self):
        self.client.force_authenticate(user=self.regular_admin)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        data = {"first_name": "Illegal Update"}
        response = self.client.patch(f"/api/accounts/users/{self.superadmin1.id}/", data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_admin_cannot_delete_superadmin(self):
        self.client.force_authenticate(user=self.regular_admin)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        response = self.client.delete(f"/api/accounts/users/{self.superadmin1.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=self.superadmin1.id).exists())

    def test_superadmin_can_delete_another_superadmin(self):
        self.client.force_authenticate(user=self.superadmin1)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)
        response = self.client.delete(f"/api/accounts/users/{self.superadmin2.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(id=self.superadmin2.id).exists())
