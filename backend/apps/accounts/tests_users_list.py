from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company

User = get_user_model()


class UsersListTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Users Corp", slug="users-corp")
        # Role com permissão admin.user_manage (necessária após A7)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.user = User.objects.create_user(
            username="owner", email="owner@corp.com", password="pass", company=self.company, role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="users-corp")

        User.objects.create_user(username="u1", email="u1@corp.com", password="pass", company=self.company)
        User.objects.create_user(username="u2", email="u2@corp.com", password="pass", company=self.company)

    def test_users_list_has_results(self):
        res = self.client.get("/api/accounts/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("results", res.data)
        usernames = [u["username"] for u in res.data["results"]]
        self.assertIn("u1", usernames)
        self.assertIn("u2", usernames)
