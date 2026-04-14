from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule
from apps.pages.models import Page

User = get_user_model()


class PagesAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Pages Corp", slug="pages-corp")
        self.role = Role.objects.create(
            company=self.company, name="Admin", permissions=["pages.page_view", "pages.page_create"]
        )
        self.user = User.objects.create_user(
            username="pagesuser", email="p@corp.com", password="pass", company=self.company, role=self.role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="pages-corp")

        self.mod = Module.objects.create(code="pages", name="Pages")
        TenantModule.objects.create(company=self.company, module=self.mod, is_active=True)

    def test_list_and_create_pages_with_module(self):
        res = self.client.get("/api/pages/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["results"]), 0)

        payload = {"title": "Home", "slug": "home", "content": "Welcome", "status": "published"}
        create_res = self.client.post("/api/pages/", payload, format="json")
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_res.data["title"], "Home")

        list_res = self.client.get("/api/pages/")
        self.assertEqual(len(list_res.data["results"]), 1)

    def test_module_disabled_blocks(self):
        tm = TenantModule.all_objects.get(company=self.company, module=self.mod)
        tm.is_active = False
        tm.save(update_fields=["is_active"])

        res = self.client.get("/api/pages/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unique_slug_per_company(self):
        Page.objects.create(company=self.company, title="A", slug="about", content="")
        payload = {"title": "About Us", "slug": "about", "content": "x", "status": "published"}
        res = self.client.post("/api/pages/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
