from django.test import RequestFactory, TestCase, override_settings

from apps.core.models import Company
from shared_kernel.middleware import TenantMiddleware
from shared_kernel.tenant_context import get_current_company


class MiddlewareTenantTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.company = Company.objects.create(name="Test Company", slug="test-tenant", domain="custom.example.com")
        self.middleware = TenantMiddleware(lambda r: None)

    def test_identify_by_header(self):
        """Testa identificação via header X-Company-Slug."""
        request = self.factory.get("/", HTTP_X_COMPANY_SLUG="test-tenant")
        self.middleware(request)
        self.assertEqual(request.company, self.company)
        self.assertEqual(get_current_company(), self.company)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_identify_by_custom_domain(self):
        """Testa identificação via host de domínio customizado."""
        request = self.factory.get("/", HTTP_HOST="custom.example.com")
        self.middleware(request)
        self.assertEqual(request.company, self.company)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_identify_by_subdomain(self):
        """Testa identificação via subdomínio (slug)."""
        request = self.factory.get("/", HTTP_HOST="test-tenant.localhost")
        self.middleware(request)
        self.assertEqual(request.company, self.company)

    @override_settings(ALLOWED_HOSTS=["*"])
    def test_no_tenant_found(self):
        """Testa comportamento quando nenhum tenant é identificado."""
        request = self.factory.get("/", HTTP_HOST="unknown.com")
        self.middleware(request)
        self.assertIsNone(request.company)
