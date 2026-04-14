from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ModulesTestCase(APITestCase):
    def setUp(self):
        from django.core.cache import caches

        for cache in caches.all():
            cache.clear()
        # Setup similar to test_api_flow
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        self.user = User.objects.create_user(
            username="tester", email="tester@test.corp", password="pass", company=self.company
        )

        # Iniciar roles e atribuir Admin
        from apps.accounts.models import Role
        from apps.accounts.services import AccountService

        AccountService.ensure_default_roles(self.company)
        admin_role = Role.all_objects.get(name="Administrador", company=self.company)
        self.user.role = admin_role
        self.user.save()

        self.client.force_authenticate(user=self.user)
        # Set tenant header
        self.client.credentials(HTTP_X_COMPANY_SLUG="test-corp")

        # Enable required modules for this tenant
        pages = Module.objects.create(code="pages", name="Pages")
        articles = Module.objects.create(code="articles", name="Articles")
        messenger = Module.objects.create(code="messenger", name="Messenger")
        TenantModule.objects.create(company=self.company, module=pages, is_active=True)
        TenantModule.objects.create(company=self.company, module=articles, is_active=True)
        TenantModule.objects.create(company=self.company, module=messenger, is_active=True)

        # License for limits
        self.feat_articles = Feature.objects.create(code="max_articles", name="Max Articles")
        self.plan = Plan.objects.create(name="Pro")
        PlanFeature.objects.create(plan=self.plan, feature=self.feat_articles, value="unlimited")
        License.objects.create(company=self.company, plan=self.plan, is_active=True)

    def test_pages_crud(self):
        # Create Page
        data = {"title": "About Us", "slug": "about", "content": "We are cool.", "status": "published"}

        response = self.client.post("/api/pages/", data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # List Pages
        response = self.client.get("/api/pages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["title"], "About Us")

    def test_articles_crud(self):
        # Create Article
        data = {"title": "News 1", "slug": "news-1", "content": "Extra extra!"}
        response = self.client.post("/api/articles/articles/", data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["author_name"], "tester")

    def test_messenger_conversation(self):
        # Create Conversation
        data = {"title": "General Chat", "is_group": True}
        response = self.client.post("/api/messenger/conversations/", data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conv_id = response.data["id"]

        # Send Message
        msg_data = {"content": "Hello world"}
        response = self.client.post(f"/api/messenger/conversations/{conv_id}/send_message/", msg_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
