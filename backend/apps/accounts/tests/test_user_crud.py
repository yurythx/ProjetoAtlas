from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature

User = get_user_model()


class UserCRUDTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="CRUD Corp", slug="crud-corp")

        plan = Plan.objects.create(name="Enterprise CRUD")
        feat = Feature.objects.create(code="max_users", name="Max Users")
        PlanFeature.objects.create(plan=plan, feature=feat, value="100")
        License.objects.create(company=self.company, plan=plan, is_active=True)

        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.user = User.objects.create_user(
            username="admin", email="admin@crud.com", password="pass12345", company=self.company, role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="crud-corp")

        self.member_role = Role.objects.create(company=self.company, name="Member")

    def test_create_update_delete_user(self):
        create_payload = {
            "username": "newuser",
            "email": "new@crud.com",
            "password": "newpassword123",
            "first_name": "New",
            "last_name": "User",
            "role": self.member_role.id,
        }
        res_create = self.client.post("/api/accounts/users/", create_payload, format="json")
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        created_id = res_create.data["id"]

        res_get = self.client.get(f"/api/accounts/users/{created_id}/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertEqual(res_get.data["username"], "newuser")

        res_patch = self.client.patch(
            f"/api/accounts/users/{created_id}/",
            {"first_name": "Updated", "password": "changedpass123"},
            format="json",
        )
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)

        updated = User.all_objects.get(id=created_id)
        self.assertEqual(updated.first_name, "Updated")
        self.assertTrue(updated.check_password("changedpass123"))

        res_delete = self.client.delete(f"/api/accounts/users/{created_id}/")
        self.assertEqual(res_delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.all_objects.filter(id=created_id).exists())
