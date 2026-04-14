from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.articles.models import Article, Category
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule
from shared_kernel.tenant_context import set_current_company
from shared_kernel.utils import make_key_with_tenant, tenant_upload_to


class SecuritySuiteTest(TestCase):
    def setUp(self):
        from django.core.cache import caches

        for cache in caches.all():
            cache.clear()
        # Setup Tenants
        self.company_a = Company.objects.create(name="Company A", slug="comp-a")
        self.company_b = Company.objects.create(name="Company B", slug="comp-b")

        # Setup Users
        self.user_a = User.objects.create_user(username="user_a", password="password", company=self.company_a)
        self.user_b = User.objects.create_user(username="user_b", password="password", company=self.company_b)

        # Iniciar roles e atribuir Admin para ambos
        from apps.accounts.models import Role
        from apps.accounts.services import AccountService

        AccountService.ensure_default_roles(self.company_a)
        AccountService.ensure_default_roles(self.company_b)

        self.user_a.role = Role.all_objects.get(name="Administrador", company=self.company_a)
        self.user_a.save()

        self.user_b.role = Role.all_objects.get(name="Administrador", company=self.company_b)
        self.user_b.save()

        # Setup Clients
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        self.client_a.defaults["HTTP_X_COMPANY_SLUG"] = "comp-a"

        self.client_b = APIClient()
        self.client_b.force_authenticate(user=self.user_b)
        self.client_b.defaults["HTTP_X_COMPANY_SLUG"] = "comp-b"

        # Setup Modules
        self.module_articles = Module.objects.create(code="articles", name="Articles")
        self.module_messenger = Module.objects.create(code="messenger", name="Messenger")

        # Enable modules for A
        TenantModule.objects.create(company=self.company_a, module=self.module_articles, is_active=True)
        # Messenger NOT enabled for A (implicit or explicit)

        # Enable all for B
        TenantModule.objects.create(company=self.company_b, module=self.module_articles, is_active=True)
        TenantModule.objects.create(company=self.company_b, module=self.module_messenger, is_active=True)

    def test_cross_tenant_data_leakage(self):
        """
        Critical: Tenant B should NOT see Tenant A's data.
        """
        # A creates an article
        category = Category.objects.create(name="Cat A", slug="cat-a", company=self.company_a)
        article = Article.objects.create(
            title="Secret A", slug="secret-a", content="Content", company=self.company_a, category=category
        )

        # B lists articles
        # Correct URL is usually /api/articles/ (if router registers r'')
        response = self.client_b.get("/api/articles/articles/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]

        # B should see 0 articles (or only their own)
        self.assertEqual(len(results), 0)

        # B tries to access A's article directly by ID
        response_direct = self.client_b.get(f"/api/articles/articles/{article.id}/")
        # Should be 404 because QuerySet is filtered
        self.assertEqual(response_direct.status_code, status.HTTP_404_NOT_FOUND)

    def test_module_access_control(self):
        """
        Verification: Tenant A should NOT be able to access Messenger endpoints
        because the module is not enabled for them.
        """
        # A tries to access messenger
        # Assuming there is an endpoint like /api/messenger/conversations/
        # Need to check actual URLconf, assuming standard router
        response = self.client_a.get("/api/messenger/conversations/")

        # Current behavior (Likely): 200 OK (empty list) because no permission check
        # Desired behavior: 403 Forbidden or 404 Not Found
        print(f"Module Access Response: {response.status_code}")

        if response.status_code == 404 and "Not Found" in str(response.data):
            # Could be 404 if URL doesn't exist, but here we expect 403 or specific module error
            pass

        self.assertIn(response.status_code, [403, 404], "Tenant A access 'messenger' but module is disabled!")

    def test_file_upload_isolation_logic(self):
        """
        Verify that the file path generator correctly includes the tenant slug.
        """

        # Mock instance
        class MockInstance:
            company = self.company_a

        instance = MockInstance()
        filename = "image.jpg"

        upload_handler = tenant_upload_to("articles")
        path = upload_handler(instance, filename)

        # expected = r"tenants/comp-a/articles/image.jpg"
        # Handle OS path separators if needed, but output usually forward slash in Django storage
        # normalize for comparison
        self.assertTrue("comp-a" in path)
        self.assertTrue("articles" in path)

    def test_redis_key_prefix_logic(self):
        """
        Verify cache key generator.
        """
        # Set context
        set_current_company(self.company_a)

        key = make_key_with_tenant("mykey", "key_prefix", 1)
        # Expected: key_prefix:1:comp-a:mykey

        parts = key.split(":")
        self.assertIn("comp-a", parts)
        self.assertEqual(parts[-1], "mykey")

        # Change context
        set_current_company(self.company_b)
        key_b = make_key_with_tenant("mykey", "key_prefix", 1)
        self.assertIn("comp-b", key_b)

        self.assertNotEqual(key, key_b)
