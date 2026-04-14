from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ModuleManagerAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        self.user = User.objects.create_user(
            username="tester", email="tester@test.corp", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="test-corp")

        self.pages = Module.objects.create(code="pages", name="Pages")
        self.articles = Module.objects.create(code="articles", name="Articles")
        self.messenger = Module.objects.create(code="messenger", name="Messenger")

        TenantModule.objects.create(company=self.company, module=self.pages, is_active=True)
        TenantModule.objects.create(company=self.company, module=self.articles, is_active=True)
        TenantModule.objects.create(company=self.company, module=self.messenger, is_active=True)

    def test_available_modules(self):
        res = self.client.get("/api/modules/available/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # available endpoint still has pagination (ReadOnlyModelViewSet default)
        # but my-modules (TenantModuleViewSet) has pagination_class = None
        codes = [m["code"] for m in res.data["results"]]
        self.assertIn("pages", codes)
        self.assertIn("articles", codes)
        self.assertIn("messenger", codes)

    def test_my_modules(self):
        res = self.client.get("/api/modules/my-modules/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(res.data) >= 3)

    def test_superuser_bypass(self):
        # Disable one module
        tm = TenantModule.all_objects.get(company=self.company, module=self.articles)
        tm.is_active = False
        tm.save(update_fields=["is_active"])
        # Make user superuser
        self.user.is_superuser = True
        self.user.save(update_fields=["is_superuser"])
        # Access endpoint protected by HasModuleAccess (articles list)
        res = self.client.get("/api/articles/articles/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
