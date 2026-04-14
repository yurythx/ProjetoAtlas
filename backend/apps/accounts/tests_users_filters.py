from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company

User = get_user_model()


class UsersFiltersTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Filter Corp", slug="filter-corp")
        # Role com permissão admin.user_manage (necessária após A7)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.user = User.objects.create_user(
            username="owner", email="owner@corp.com", password="pass", company=self.company, role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="filter-corp")

        role_dev = Role.objects.create(company=self.company, name="Dev")
        role_hr = Role.objects.create(company=self.company, name="HR")
        User.objects.create_user(
            username="devguy", email="d@corp.com", password="pass", company=self.company, role=role_dev
        )
        User.objects.create_user(
            username="hrgal", email="h@corp.com", password="pass", company=self.company, role=role_hr
        )
        inactive = User.objects.create_user(
            username="inactive", email="inactive@corp.com", password="pass", company=self.company, role=role_hr
        )
        inactive.is_active = False
        inactive.save(update_fields=["is_active"])

        self.role_dev = role_dev

    def test_filter_by_role(self):
        res = self.client.get(f"/api/accounts/users/?role={self.role_dev.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in res.data["results"]]
        self.assertIn("devguy", usernames)
        self.assertNotIn("hrgal", usernames)

    def test_search_by_username(self):
        res = self.client.get("/api/accounts/users/?q=dev")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in res.data["results"]]
        self.assertIn("devguy", usernames)

    def test_filter_by_active_status(self):
        res = self.client.get("/api/accounts/users/?active=false")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        usernames = [u["username"] for u in res.data["results"]]
        self.assertIn("inactive", usernames)
        self.assertNotIn("devguy", usernames)
