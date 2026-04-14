"""
conftest.py — Project-wide pytest fixtures.

These fixtures are automatically available to all test modules.
Import this file implicitly by placing it at the backend root.

Usage patterns:
    def test_something(api_client, company, user):
        ...

    def test_admin_action(admin_client, company, admin_user):
        ...
"""

import pytest
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model

User = get_user_model()


# ---------------------------------------------------------------------------
# Celery: always run tasks synchronously during tests
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True, scope="session")
def celery_eager_mode():
    """
    T3: Force Celery tasks to run synchronously during tests.
    Also propagates exceptions so task errors are not silently swallowed.
    This detects serialisation bugs that only surface in production.
    """
    original_eager = django_settings.CELERY_TASK_ALWAYS_EAGER
    original_propagate = django_settings.CELERY_TASK_EAGER_PROPAGATES
    django_settings.CELERY_TASK_ALWAYS_EAGER = True
    django_settings.CELERY_TASK_EAGER_PROPAGATES = True
    yield
    django_settings.CELERY_TASK_ALWAYS_EAGER = original_eager
    django_settings.CELERY_TASK_EAGER_PROPAGATES = original_propagate


# ---------------------------------------------------------------------------
# Company + Tenant fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def company(db):
    """A fresh Company instance for use in tests."""
    from apps.core.models import Company

    return Company.all_companies.create(
        name="Test Corp",
        slug="test-corp",
    )


@pytest.fixture
def company_b(db):
    """A second Company to verify multi-tenant isolation."""
    from apps.core.models import Company

    return Company.all_companies.create(
        name="Other Corp",
        slug="other-corp",
    )


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def role(db, company):
    """A default Role for testing RBAC permissions."""
    from apps.accounts.models import Role

    return Role.objects.create(
        company=company,
        name="Editor",
        permissions=["articles.article_create", "articles.article_update"],
    )


@pytest.fixture
def user(db, company, role):
    """A standard authenticated user belonging to `company`."""
    u = User.objects.create_user(
        username="testuser",
        email="testuser@test-corp.com",
        password="testpass123!",
        company=company,
    )
    u.role = role
    u.save(update_fields=["role"])
    return u


@pytest.fixture
def user_b(db, company_b):
    """A user from a different company — used to test tenant isolation."""
    return User.objects.create_user(
        username="otheruser",
        email="otheruser@other-corp.com",
        password="testpass123!",
        company=company_b,
    )


@pytest.fixture
def admin_user(db, company):
    """A superuser for admin-level operation tests."""
    u = User.objects.create_superuser(
        username="admin",
        email="admin@test-corp.com",
        password="adminpass123!",
    )
    u.company = company
    u.save(update_fields=["company"])
    return u


# ---------------------------------------------------------------------------
# API Client fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def api_client():
    """Unauthenticated DRF APIClient."""
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def auth_client(api_client, user, company):
    """APIClient authenticated as `user` with company header set."""
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {refresh.access_token!s}",
        HTTP_X_COMPANY_SLUG=company.slug,
    )
    return api_client


@pytest.fixture
def admin_client(api_client, admin_user, company):
    """APIClient authenticated as `admin_user`."""
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(admin_user)
    api_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {refresh.access_token!s}",
        HTTP_X_COMPANY_SLUG=company.slug,
    )
    return api_client


# ---------------------------------------------------------------------------
# Tenant context fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_tenant_context():
    """
    Auto-use fixture: ensure tenant context is reset between tests.
    Prevents context leaking from one test to the next.
    """
    from shared_kernel.tenant_context import set_current_company

    set_current_company(None)
    yield
    set_current_company(None)


@pytest.fixture
def with_company_context(company):
    """Set company in the tenant context for tests that call services directly."""
    from shared_kernel.tenant_context import set_current_company

    set_current_company(company)
    yield company
    set_current_company(None)
