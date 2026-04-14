from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company
from apps.licensing.models import Feature, Plan
from apps.module_manager.models import Module

User = get_user_model()


class AdminModulesTest(APITestCase):
    def setUp(self):
        # Create Company
        self.company = Company.objects.create(name="Tech Corp", slug="tech-corp")

        # Create User
        role = Role.all_objects.create(company=self.company, name="Admin", permissions=["admin.settings_manage"])
        self.user = User.objects.create_user(
            username="admin", email="admin@tech.com", password="password123", company=self.company, role=role
        )
        self.client.force_authenticate(user=self.user)
        # Set tenant context header for all requests
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = self.company.slug

        # Setup Initial Data (Global)
        self.feature = Feature.objects.create(code="max_users", name="Max Users")
        self.plan = Plan.objects.create(name="Pro Plan", price=99.99)
        self.module = Module.objects.create(code="messenger", name="Messenger Module")

    def test_licensing_flow(self):
        # 1. List Plans
        response = self.client.get("/api/licensing/plans/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

        # 2. Create License
        data = {"plan": self.plan.id}
        response = self.client.post("/api/licensing/my-license/", data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["plan"], self.plan.id)

        # 3. Verify License List
        response = self.client.get("/api/licensing/my-license/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)

    def test_module_manager_flow(self):
        # 1. List Available Modules
        response = self.client.get("/api/modules/available/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [m["code"] for m in response.data["results"]]
        self.assertIn("crm", codes)
        self.assertIn("messenger", codes)

        # 2. Activate Module
        data = {"module_code": "messenger"}
        response = self.client.post("/api/modules/my-modules/activate/", data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["is_active"])

        # 3. Verify My Modules
        response = self.client.get("/api/modules/my-modules/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        my_codes = [m["module_code"] for m in response.data["results"]]
        self.assertIn("messenger", my_codes)
        self.assertIn("crm", my_codes)
