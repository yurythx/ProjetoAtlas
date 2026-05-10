"""Smoke tests verifying factories create valid DB records."""

import pytest

from factories import (
    ArticleFactory,
    AutomationRuleFactory,
    ColumnFactory,
    CompanyFactory,
    ContactFactory,
    DealFactory,
    FinanceCategoryFactory,
    HighPriorityDealFactory,
    IncomeTransactionFactory,
    NotificationFactory,
    PipelineFactory,
    PublicArticleFactory,
    RoleFactory,
    TenantModuleFactory,
    TransactionFactory,
    UserFactory,
)


@pytest.mark.django_db
class TestCoreFactories:
    def test_company_factory(self):
        c = CompanyFactory()
        assert c.pk is not None
        assert c.slug

    def test_user_factory(self):
        u = UserFactory()
        assert u.pk is not None
        assert u.check_password("testpass123!")

    def test_role_factory(self):
        r = RoleFactory()
        assert r.pk is not None
        assert r.company_id is not None

    def test_tenant_module_factory(self):
        tm = TenantModuleFactory()
        assert tm.is_active is True


@pytest.mark.django_db
class TestArticleFactories:
    def test_article_factory(self):
        a = ArticleFactory()
        assert a.pk is not None
        assert a.status == "published"
        assert a.company == a.author.company

    def test_public_article_factory(self):
        a = PublicArticleFactory()
        assert a.is_public is True


@pytest.mark.django_db
class TestCRMFactories:
    def test_pipeline_factory(self):
        p = PipelineFactory()
        assert p.pk is not None

    def test_column_factory(self):
        col = ColumnFactory()
        assert col.pipeline.company == col.company

    def test_deal_factory(self):
        d = DealFactory()
        assert d.pk is not None
        assert d.priority == "MEDIUM"
        assert d.company == d.owner.company

    def test_high_priority_deal_factory(self):
        d = HighPriorityDealFactory()
        assert d.priority == "HIGH"

    def test_automation_rule_factory(self):
        r = AutomationRuleFactory()
        assert r.pk is not None
        assert r.is_active is True

    def test_batch_creation(self):
        deals = DealFactory.create_batch(3)
        assert len(deals) == 3

    def test_tenant_isolation(self):
        company_a = CompanyFactory()
        company_b = CompanyFactory()
        d_a = DealFactory(company=company_a)
        d_b = DealFactory(company=company_b)
        assert d_a.company != d_b.company


@pytest.mark.django_db
class TestFinanceFactories:
    def test_transaction_factory(self):
        t = TransactionFactory()
        assert t.pk is not None
        assert t.type == "out"

    def test_income_transaction_factory(self):
        t = IncomeTransactionFactory()
        assert t.type == "in"
        assert t.status == "paid"

    def test_category_company_matches(self):
        t = TransactionFactory()
        assert t.category.company == t.company


@pytest.mark.django_db
class TestNotificationFactory:
    def test_notification_factory(self):
        n = NotificationFactory()
        assert n.pk is not None
        assert n.is_read is False
        assert n.recipient.company == n.company
