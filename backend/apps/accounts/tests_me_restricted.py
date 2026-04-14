from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company

User = get_user_model()


class MeRestrictedFieldsTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Me Corp", slug="me-corp")
        self.user = User.objects.create_user(
            username="meuser", email="me@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="me-corp")
        self.role1 = Role.objects.create(company=self.company, name="R1")
        self.role2 = Role.objects.create(company=self.company, name="R2")
        self.user.role = self.role1
        self.user.save(update_fields=["role"])

    def test_me_patch_ignores_role_changes(self):
        res = self.client.patch(
            "/api/accounts/users/me/", {"role": self.role2.id, "first_name": "Updated"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role_id, self.role1.id)
        self.assertEqual(res.data["first_name"], "Updated")
