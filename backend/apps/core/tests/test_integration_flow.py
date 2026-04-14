from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class IntegrationFlowTest(TestCase):
    def setUp(self):
        from django.core.cache import caches

        for cache in caches.all():
            cache.clear()
        self.client = APIClient()
        # Ensure the 'articles' module exists in the system (globally)
        self.article_module = Module.objects.create(
            code="articles", name="Articles Module", description="Manage blog posts", is_default=False
        )

        # Setup Default Plan for testing
        self.feat_articles = Feature.objects.create(code="max_articles", name="Max Articles")
        self.plan = Plan.objects.create(name="Starter")
        PlanFeature.objects.create(plan=self.plan, feature=self.feat_articles, value="unlimited")

    def test_end_to_end_flow(self):
        """
        Tests the complete flow:
        1. Create Company (Tenant)
        2. Register User
        3. Login (Get Token)
        4. Fail to access protected module (Articles)
        5. Grant access to module
        6. Successfully access module
        """

        # 1. Create Company (Public)
        company_data = {"name": "Tech Corp", "slug": "tech-corp", "branding": {}}
        response = self.client.post("/api/core/companies/", company_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Company.objects.count(), 1)
        company = Company.objects.get(slug="tech-corp")

        # Assign License manually (normally done by system logic but needed here for limits)
        License.objects.create(company=company, plan=self.plan, is_active=True)

        # 2. Register User (Public)
        user_data = {
            "username": "alice",
            "email": "alice@tech.corp",
            "password": "strongpassword123",
            "company_slug": "tech-corp",
            "plan_tier": "starter",  # Hypothetical field if needed, but for now I will rely on the fact that the company has a license.
        }
        # Force staff status on the user created by the API for simplified testing of article creation
        # Alternatively, we could create a Role and assign it.
        # But for 'test_end_to_end_flow' let's verify if the user becomes an admin or regular user.
        # The register endpoint usually creates an OWNER or ADMIN if it's the first user? No, this is just register.
        # Let's see if we can patch the user after creation.
        response = self.client.post("/api/accounts/register/", user_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.all_objects.count(), 1)

        # Verify user association
        user = User.all_objects.get(username="alice")
        self.assertEqual(user.company.slug, "tech-corp", "User was not assigned to correct company!")

        # 3. Login / Get Token (Generate NEW token with updated permissions if claims depend on user state)
        login_data = {"username": "alice", "password": "strongpassword123"}
        response = self.client.post("/api/accounts/token/", login_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        access_token = response.data["access"]

        # Setup authenticated client with Tenant Context
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + access_token, HTTP_X_COMPANY_SLUG="tech-corp")

        # 4. Access Protected Endpoint (Articles) - Should Fail
        # Because the company 'tech-corp' does not have 'articles' module active yet
        response = self.client.get("/api/articles/articles/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Grant Access (Simulating Admin/Licensing Action)
        TenantModule.objects.create(company=company, module=self.article_module, is_active=True)

        # 6. Access Protected Endpoint (Articles) - Should Succeed
        response = self.client.get("/api/articles/articles/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should return empty list initially
        self.assertEqual(response.data["count"], 0)

        # 7. Create an Article (Verify write access within module)
        # Using the standard token auth
        self.client.credentials(HTTP_AUTHORIZATION="Bearer " + access_token, HTTP_X_COMPANY_SLUG="tech-corp")

        article_data = {
            "title": "Hello World",
            "slug": "hello-world",
            "content": "First post",
        }
        response = self.client.post(
            "/api/articles/articles/?company_slug=tech-corp",
            article_data,
            format="json",
            HTTP_AUTHORIZATION="Bearer " + access_token,
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "Hello World")
