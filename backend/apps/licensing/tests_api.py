from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature

User = get_user_model()


class LicensingAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Lic Corp", slug="lic-corp")
        self.role = Role.objects.create(
            company=self.company,
            name="Admin",
            permissions=["admin.user_manage", "articles.article_create"],
        )
        self.user = User.all_objects.create_user(
            username="licuser", email="lic@corp.com", password="pass", company=self.company, role=self.role
        )
        self.user.role = self.role
        self.user.save(update_fields=["role"])
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="lic-corp")

        # Seed features and plan
        feat_users = Feature.objects.create(code="max_users", name="Max Users")
        feat_cms = Feature.objects.create(code="has_cms", name="CMS")
        self.plan = Plan.objects.create(name="Pro", price="99.00")
        PlanFeature.objects.create(plan=self.plan, feature=feat_users, value="100")
        PlanFeature.objects.create(plan=self.plan, feature=feat_cms, value="true")

        # Enable articles module for this company
        from apps.module_manager.models import Module, TenantModule

        mod, _ = Module.objects.get_or_create(code="articles", defaults={"name": "Articles"})
        TenantModule.objects.create(company=self.company, module=mod, is_active=True)

    def test_create_and_get_license(self):
        res = self.client.post("/api/licensing/my-license/", {"plan": self.plan.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        lic_id = res.data["id"]
        lic = License.objects.get(id=lic_id)
        self.assertEqual(lic.company, self.company)
        self.assertEqual(lic.plan, self.plan)

        list_res = self.client.get("/api/licensing/my-license/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        # Handle pagination if necessary, though current mock might be simple list
        data = (
            list_res.data["results"]
            if isinstance(list_res.data, dict) and "results" in list_res.data
            else list_res.data
        )
        self.assertTrue(any(item["id"] == lic_id for item in data))

    def test_checkout_upgrade(self):
        new_plan = Plan.objects.create(name="Enterprise", price="499.00")
        res = self.client.post("/api/licensing/my-license/checkout/", {"plan_id": new_plan.id}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify new license is active
        lic = License.objects.get(id=res.data["id"])
        self.assertEqual(lic.plan, new_plan)
        self.assertTrue(lic.is_active)

        # Verify Audit Log
        from apps.core.models import AuditLog

        audit = AuditLog.objects.filter(resource="License", resource_id=str(lic.id)).first()
        self.assertIsNotNone(audit)
        self.assertIn("UPGRADE_PLAN", audit.action)

    def test_user_limit_enforcement(self):
        # Create a plan with limit 1 user
        small_plan = Plan.objects.create(name="Small", price="10.00")
        feat_users = Feature.objects.get(code="max_users")
        PlanFeature.objects.create(plan=small_plan, feature=feat_users, value="1")

        License.objects.create(company=self.company, plan=small_plan, is_active=True)

        # Try to create second user via API
        res = self.client.post(
            "/api/accounts/users/",
            {"username": "blocked", "email": "blocked@corp.com", "password": "pass123", "role_id": None},
            format="json",
        )

        # Should be blocked by Licensing Enforcement
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Limite de users atingido", str(res.data))

    def test_article_limit_enforcement(self):
        # Create a plan with limit 0 articles
        no_article_plan = Plan.objects.create(name="No Articles", price="5.00")
        feat_articles = Feature.objects.create(code="max_articles", name="Max Articles")
        PlanFeature.objects.create(plan=no_article_plan, feature=feat_articles, value="0")

        # Deactivate old licenses
        License.objects.filter(company=self.company).update(is_active=False)
        License.objects.create(company=self.company, plan=no_article_plan, is_active=True)

        # Try to create article (using correct endpoint /api/articles/articles/)
        res = self.client.post(
            "/api/articles/articles/",
            {
                "title": "Blocked Article",
                "slug": "blocked-article",  # Serializer might require it if service doesn't generate before validation
                "content": "Should not be created",
            },
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Limite de artigos atingido", str(res.data))
