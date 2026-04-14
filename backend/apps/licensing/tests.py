from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Company

from .models import Feature, License, Plan, PlanFeature


class LicensingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        self.user = User.objects.create_user(
            username="lic_admin", email="admin@test.com", password="password123", company=self.company
        )
        self.client.force_authenticate(user=self.user)

        # Setup basic data
        self.feature = Feature.objects.create(code="max_users", name="Max Users")
        self.plan = Plan.objects.create(name="Pro Plan", price=99.99)
        PlanFeature.objects.create(plan=self.plan, feature=self.feature, value="100")

    def test_list_plans(self):
        response = self.client.get("/api/licensing/plans/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = (
            response.data["results"]
            if isinstance(response.data, dict) and "results" in response.data
            else response.data
        )
        self.assertTrue(any(p["name"] == "Pro Plan" for p in data))

    def test_assign_license(self):
        # Assign license to company
        # We don't have a public endpoint for license assignment yet,
        # but we should test the model logic ensuring the company gets the plan features.

        # 1. Create a License via Model (Admin action simulation)
        license = License.objects.create(company=self.company, plan=self.plan, is_active=True)

        # 2. Verify License creation
        self.assertEqual(license.plan.name, "Pro Plan")
        self.assertTrue(license.is_active)
        self.assertEqual(License.all_objects.filter(company=self.company).count(), 1)

        # 3. Verify access to features (Logic check)
        # Assuming we might have a helper to check features, for now just checking the relation
        self.assertTrue(self.plan.features.filter(code="max_users").exists())

    def test_feature_check(self):
        # Verify if plan has feature
        self.assertTrue(self.plan.features.filter(code="max_users").exists())
        pf = PlanFeature.objects.get(plan=self.plan, feature__code="max_users")
        self.assertEqual(pf.value, "100")
