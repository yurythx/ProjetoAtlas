"""
factories.py — Factory Boy factories for all major Atlas models.

Usage in tests:
    from factories import UserFactory, DealFactory, TransactionFactory

    user = UserFactory()                        # creates in DB
    deal = DealFactory(company=my_company)      # override fields
    deals = DealFactory.create_batch(5)         # 5 records at once
    user_stub = UserFactory.build()             # no DB hit
"""

import factory
import factory.django
from datetime import timedelta

from django.utils import timezone


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------


class CompanyFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "core.Company"
        django_get_or_create = ("slug",)

    name = factory.Sequence(lambda n: f"Company {n}")
    slug = factory.Sequence(lambda n: f"company-{n}")


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------


class RoleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "accounts.Role"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"Role {n}")
    permissions = factory.LazyFunction(list)


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "accounts.User"
        django_get_or_create = ("username",)
        exclude = ["_password"]

    _password = "testpass123!"
    username = factory.Sequence(lambda n: f"user{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")
    company = factory.SubFactory(CompanyFactory)

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop("_password", "testpass123!")
        manager = cls._get_manager(model_class)
        return manager.create_user(*args, password=password, **kwargs)


class AdminUserFactory(UserFactory):
    username = factory.Sequence(lambda n: f"admin{n}")
    email = factory.LazyAttribute(lambda o: f"{o.username}@example.com")
    is_staff = True
    is_superuser = True


# ---------------------------------------------------------------------------
# Module Manager
# ---------------------------------------------------------------------------


class ModuleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "module_manager.Module"
        django_get_or_create = ("code",)

    code = factory.Sequence(lambda n: f"module-{n}")
    name = factory.LazyAttribute(lambda o: o.code.title())
    description = factory.Faker("sentence")
    is_core = False


class TenantModuleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "module_manager.TenantModule"

    company = factory.SubFactory(CompanyFactory)
    module = factory.SubFactory(ModuleFactory)
    is_active = True


# ---------------------------------------------------------------------------
# Articles
# ---------------------------------------------------------------------------


class ArticleCategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "articles.Category"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"Category {n}")
    slug = factory.Sequence(lambda n: f"category-{n}")


class ArticleTagFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "articles.Tag"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"Tag {n}")
    slug = factory.Sequence(lambda n: f"tag-{n}")


class ArticleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "articles.Article"

    company = factory.SubFactory(CompanyFactory)
    author = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    title = factory.Sequence(lambda n: f"Article {n}")
    slug = factory.Sequence(lambda n: f"article-{n}")
    content = factory.Faker("paragraph", nb_sentences=10)
    excerpt = factory.Faker("sentence")
    status = "published"
    is_public = False


class PublicArticleFactory(ArticleFactory):
    is_public = True
    status = "published"


# ---------------------------------------------------------------------------
# CRM
# ---------------------------------------------------------------------------


class PipelineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "crm.Pipeline"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"Pipeline {n}")


class ColumnFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "crm.Column"

    company = factory.SubFactory(CompanyFactory)
    pipeline = factory.SubFactory(PipelineFactory, company=factory.SelfAttribute("..company"))
    title = factory.Sequence(lambda n: f"Column {n}")
    order = factory.Sequence(lambda n: n * 10)


class ContactFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "crm.Contact"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Faker("name")
    email = factory.Faker("email")
    phone = factory.Faker("phone_number")


class DealFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "crm.Deal"

    company = factory.SubFactory(CompanyFactory)
    owner = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    contact = factory.SubFactory(ContactFactory, company=factory.SelfAttribute("..company"))
    column = factory.SubFactory(ColumnFactory, company=factory.SelfAttribute("..company"))
    title = factory.Sequence(lambda n: f"Deal {n}")
    description = factory.Faker("paragraph")
    priority = "MEDIUM"
    record_type = "incident"
    is_closed = False


class HighPriorityDealFactory(DealFactory):
    priority = "HIGH"
    record_type = "incident"


class AutomationRuleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "crm.AutomationRule"

    company = factory.SubFactory(CompanyFactory)
    pipeline = factory.SubFactory(PipelineFactory, company=factory.SelfAttribute("..company"))
    name = factory.Sequence(lambda n: f"Rule {n}")
    trigger = "deal_created"
    action = "notify_assignee"
    conditions = factory.LazyFunction(dict)
    action_config = factory.LazyFunction(dict)
    is_active = True


# ---------------------------------------------------------------------------
# Finance
# ---------------------------------------------------------------------------


class FinanceCategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "finance.Category"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"Finance Category {n}")
    color = "#3b82f6"
    is_shared = True


class TransactionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "finance.Transaction"

    company = factory.SubFactory(CompanyFactory)
    created_by = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    category = factory.SubFactory(FinanceCategoryFactory, company=factory.SelfAttribute("..company"))
    description = factory.Sequence(lambda n: f"Transaction {n}")
    amount = factory.Faker("pydecimal", left_digits=4, right_digits=2, positive=True)
    type = "out"
    status = "pending"
    due_date = factory.LazyFunction(lambda: timezone.now().date())
    competence_date = factory.LazyFunction(lambda: timezone.now().date().replace(day=1))


class IncomeTransactionFactory(TransactionFactory):
    type = "in"
    status = "paid"


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "notifications.Notification"

    company = factory.SubFactory(CompanyFactory)
    recipient = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    title = factory.Sequence(lambda n: f"Notification {n}")
    message = factory.Faker("sentence")
    notification_type = "system"
    is_read = False


# ---------------------------------------------------------------------------
# Messenger
# ---------------------------------------------------------------------------


class ConversationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "messenger.Conversation"

    company = factory.SubFactory(CompanyFactory)
    title = factory.Sequence(lambda n: f"Conversation {n}")
    is_group = False

    @factory.post_generation
    def participants(self, create, extracted, **kwargs):
        if not create:
            return
        if extracted:
            for user in extracted:
                self.participants.add(user)


class MessageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "messenger.Message"

    company = factory.SubFactory(CompanyFactory)
    conversation = factory.SubFactory(
        ConversationFactory, company=factory.SelfAttribute("..company")
    )
    sender = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    content = factory.Faker("sentence")
    is_deleted = False


# ---------------------------------------------------------------------------
# Calendar
# ---------------------------------------------------------------------------


class EventFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "calendar.Event"

    company = factory.SubFactory(CompanyFactory)
    owner = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    title = factory.Sequence(lambda n: f"Event {n}")
    start_datetime = factory.LazyFunction(lambda: timezone.now())
    end_datetime = factory.LazyFunction(lambda: timezone.now() + timedelta(hours=1))
    is_all_day = False
    color_category = "blue"


# ---------------------------------------------------------------------------
# CMDB
# ---------------------------------------------------------------------------


class CITypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "cmdb.CIType"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"CI Type {n}")


class CIFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "cmdb.CI"

    company = factory.SubFactory(CompanyFactory)
    ci_type = factory.SubFactory(CITypeFactory, company=factory.SelfAttribute("..company"))
    name = factory.Sequence(lambda n: f"CI {n}")
    status = "active"


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------


class PageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "pages.Page"

    company = factory.SubFactory(CompanyFactory)
    title = factory.Sequence(lambda n: f"Page {n}")
    slug = factory.Sequence(lambda n: f"page-{n}")
    content = factory.Faker("paragraph")
    status = "published"


# ---------------------------------------------------------------------------
# Service Catalog
# ---------------------------------------------------------------------------


class ServiceCategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "service_catalog.ServiceCategory"

    company = factory.SubFactory(CompanyFactory)
    name = factory.Sequence(lambda n: f"Service Category {n}")


class ServiceDefinitionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "service_catalog.ServiceDefinition"

    company = factory.SubFactory(CompanyFactory)
    category = factory.SubFactory(ServiceCategoryFactory, company=factory.SelfAttribute("..company"))
    name = factory.Sequence(lambda n: f"Service {n}")
    is_active = True


class ServiceItemFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "service_catalog.ServiceItem"

    company = factory.SubFactory(CompanyFactory)
    definition = factory.SubFactory(
        ServiceDefinitionFactory, company=factory.SelfAttribute("..company")
    )
    name = factory.Sequence(lambda n: f"Service Item {n}")
    record_type = "service_request"
    is_active = True


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------


class WebhookSubscriptionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "webhooks.WebhookSubscription"

    company = factory.SubFactory(CompanyFactory)
    url = factory.Sequence(lambda n: f"https://hooks.example.com/endpoint-{n}")
    events = factory.LazyFunction(lambda: ["deal.created", "deal.updated"])
    is_active = True


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------


class PayrollRunFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "payroll.PayrollRun"

    company = factory.SubFactory(CompanyFactory)
    kind = "monthly"
    status = "closed"
    period_start = factory.LazyFunction(lambda: timezone.now().date().replace(day=1))
    period_end = factory.LazyFunction(lambda: timezone.now().date())
    scheduled_pay_date = factory.LazyFunction(lambda: timezone.now().date())
    created_by = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))


class PayrollLineFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "payroll.PayrollLine"

    company = factory.SubFactory(CompanyFactory)
    payroll_run = factory.SubFactory(PayrollRunFactory, company=factory.SelfAttribute("..company"))
    user = factory.SubFactory(UserFactory, company=factory.SelfAttribute("..company"))
    label = factory.Sequence(lambda n: f"Salário Base {n}")
    line_type = "earning"
    amount = factory.LazyFunction(lambda: __import__("decimal").Decimal("5000.00"))
