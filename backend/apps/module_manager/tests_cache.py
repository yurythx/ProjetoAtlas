from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class TenantCacheTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Cache Corp", slug="cache-corp")
        self.user = User.all_objects.create_user(
            username="cacheuser", email="cache@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="cache-corp")

        self.pages = Module.objects.create(code="pages", name="Pages")
        self.messenger = Module.objects.create(code="messenger", name="Messenger")
        TenantModule.objects.create(company=self.company, module=self.pages, is_active=True)

    def test_list_is_cached_per_tenant(self):
        res1 = self.client.get("/api/modules/my-modules/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        count_initial = len(res1.data["results"])

        # Create module directly without hitting view (so cache is not invalidated)
        TenantModule.objects.create(company=self.company, module=self.messenger, is_active=True)

        res2 = self.client.get("/api/modules/my-modules/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        count_after = len(res2.data["results"])

        # Expect cached result to be same as initial (since invalidate happens only in perform_create/update)
        self.assertEqual(count_initial, count_after)
