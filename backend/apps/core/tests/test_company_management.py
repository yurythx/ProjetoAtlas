from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company

User = get_user_model()


class CompanyManagementPermissionTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Base", slug="base")

        self.superuser = User.objects.create_superuser(
            username="superuser", password="password", email="super@admin.com", company=self.company
        )

        self.regular_admin = User.objects.create_user(
            username="admin", password="password", email="admin@test.com", company=self.company, is_staff=True
        )

    def test_superuser_can_create_company(self):
        self.client.force_authenticate(user=self.superuser)
        data = {"name": "New Company", "slug": "new-company"}
        response = self.client.post("/api/core/companies/", data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Company.objects.filter(slug="new-company").exists())

    def test_regular_admin_cannot_create_company(self):
        self.client.force_authenticate(user=self.regular_admin)
        data = {"name": "Restricted", "slug": "restricted"}
        response = self.client.post("/api/core/companies/", data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_update_company(self):
        self.client.force_authenticate(user=self.superuser)
        data = {"name": "Updated Name"}
        response = self.client.patch(f"/api/core/companies/{self.company.slug}/", data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.company.refresh_from_db()
        self.assertEqual(self.company.name, "Updated Name")

    def test_regular_admin_cannot_update_company(self):
        self.client.force_authenticate(user=self.regular_admin)
        data = {"name": "Illegal Update"}
        response = self.client.patch(f"/api/core/companies/{self.company.slug}/", data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superuser_can_delete_company(self):
        self.client.force_authenticate(user=self.superuser)
        response = self.client.delete(f"/api/core/companies/{self.company.slug}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Company.objects.filter(slug="base").exists())

    def test_regular_admin_cannot_delete_company(self):
        self.client.force_authenticate(user=self.regular_admin)
        response = self.client.delete(f"/api/core/companies/{self.company.slug}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_any_auth_can_list_companies(self):
        # We kept 'list' as IsAuthenticated for ease of setup as per views.py note
        self.client.force_authenticate(user=self.regular_admin)
        response = self.client.get("/api/core/companies/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
