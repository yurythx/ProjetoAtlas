from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.api_keys.models import APIKey
from apps.calendar.models import Event
from apps.core.models import AuditLog, Company, LDAPConfig
from apps.crm.models import Contact, Deal, Pipeline, Stage
from apps.licensing.models import Feature, License, Plan, PlanFeature
from apps.module_manager.models import Module, TenantModule
from apps.webhooks.models import WebhookSubscription

User = get_user_model()


class RBACPermissionToggleTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="ACME", slug="acme")
        from django.core.cache import cache

        feature, _ = Feature.objects.get_or_create(code="api_access", defaults={"name": "API Access"})
        plan, _ = Plan.objects.get_or_create(name="Test Plan", defaults={"price": 0.00})
        PlanFeature.objects.update_or_create(plan=plan, feature=feature, defaults={"value": "true"})
        License.objects.create(company=self.company, plan=plan, is_active=True)
        cache.delete(f"lic:feat:{self.company.id}:api_access")

        self.crm_module, _ = Module.objects.get_or_create(code="crm", defaults={"name": "CRM", "description": "CRM"})
        self.media_module, _ = Module.objects.get_or_create(
            code="media", defaults={"name": "Mídia", "description": "Mídia"}
        )
        self.messenger_module, _ = Module.objects.get_or_create(
            code="messenger", defaults={"name": "Messenger", "description": "Messenger"}
        )
        self.calendar_module, _ = Module.objects.get_or_create(
            code="calendar", defaults={"name": "Calendário", "description": "Calendário"}
        )

        TenantModule.objects.get_or_create(company=self.company, module=self.crm_module, defaults={"is_active": True})
        TenantModule.objects.get_or_create(company=self.company, module=self.media_module, defaults={"is_active": True})
        TenantModule.objects.get_or_create(company=self.company, module=self.messenger_module, defaults={"is_active": True})
        TenantModule.objects.get_or_create(company=self.company, module=self.calendar_module, defaults={"is_active": True})

        self.admin_role = Role.all_objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.admin_user = User.all_objects.create_user(
            username="admin",
            email="admin@acme.com",
            password="password",
            company=self.company,
            role=self.admin_role,
        )

        self.subject_role = Role.all_objects.create(company=self.company, name="Subject", permissions=[])
        self.subject_user = User.all_objects.create_user(
            username="subject",
            email="subject@acme.com",
            password="password",
            company=self.company,
            role=self.subject_role,
        )

        self.other_user = User.all_objects.create_user(
            username="other",
            email="other@acme.com",
            password="password",
            company=self.company,
            role=self.subject_role,
        )

        self.contact = Contact.objects.create(company=self.company, name="Cliente", email="cliente@acme.com")
        pipeline = Pipeline.all_objects.create(company=self.company, name="Suporte")
        stage = Stage.all_objects.get(pipeline=pipeline, name="Novo")
        self.deal = Deal.all_objects.create(
            company=self.company,
            owner=self.other_user,
            title="Card Teste",
            contact=self.contact,
            stage=stage,
            priority="MEDIUM",
        )

    def as_company(self, user):
        self.client.force_authenticate(user=None)
        self.client.credentials()
        refreshed = User.all_objects.select_related("role", "company").get(id=user.id)
        self.client.force_authenticate(user=refreshed)
        self.client.credentials(HTTP_X_COMPANY_SLUG=self.company.slug)

    def update_subject_role_permissions(self, permissions_list):
        self.as_company(self.admin_user)
        payload = {
            "name": self.subject_role.name,
            "description": self.subject_role.description,
            "permissions": permissions_list,
        }
        res = self.client.put(f"/api/accounts/roles/{self.subject_role.id}/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.subject_role.refresh_from_db()
        self.assertEqual(sorted(self.subject_role.permissions), sorted(permissions_list))

    def test_crm_deal_view_toggle_affects_access(self):
        self.as_company(self.subject_user)
        res = self.client.get("/api/crm/deals/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["crm.deal_view"])
        self.as_company(self.subject_user)
        res = self.client.get("/api/crm/deals/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.update_subject_role_permissions([])
        self.as_company(self.subject_user)
        res = self.client.get("/api/crm/deals/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_crm_deal_comment_toggle_affects_add_note(self):
        self.update_subject_role_permissions(["crm.deal_view"])

        self.as_company(self.subject_user)
        res = self.client.post(f"/api/crm/deals/{self.deal.id}/notes/", {"description": "teste"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["crm.deal_view", "crm.deal_comment"])
        self.as_company(self.subject_user)
        res = self.client.post(f"/api/crm/deals/{self.deal.id}/notes/", {"description": "teste"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        self.update_subject_role_permissions(["crm.deal_view"])
        self.as_company(self.subject_user)
        res = self.client.post(f"/api/crm/deals/{self.deal.id}/notes/", {"description": "teste 2"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_crm_deal_attach_toggle_affects_attachments_action(self):
        self.update_subject_role_permissions(["crm.deal_view"])

        self.as_company(self.subject_user)
        res = self.client.get(f"/api/crm/deals/{self.deal.id}/attachments/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["crm.deal_view", "crm.deal_attach"])
        self.as_company(self.subject_user)
        res = self.client.get(f"/api/crm/deals/{self.deal.id}/attachments/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.update_subject_role_permissions(["crm.deal_view"])
        self.as_company(self.subject_user)
        res = self.client.get(f"/api/crm/deals/{self.deal.id}/attachments/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_crm_deal_attach_delete_toggle_affects_delete_attachment_action(self):
        self.update_subject_role_permissions(["crm.deal_view", "crm.deal_attach"])

        self.as_company(self.subject_user)
        res = self.client.delete(f"/api/crm/deals/{self.deal.id}/attachments/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["crm.deal_view", "crm.deal_attach", "crm.deal_attach_delete"])
        self.as_company(self.subject_user)
        res = self.client.delete(f"/api/crm/deals/{self.deal.id}/attachments/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_messenger_view_toggle_affects_contacts_endpoint(self):
        self.as_company(self.subject_user)
        res = self.client.get("/api/messenger/contacts/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["messenger.view"])
        self.as_company(self.subject_user)
        res = self.client.get("/api/messenger/contacts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.update_subject_role_permissions([])
        self.as_company(self.subject_user)
        res = self.client.get("/api/messenger/contacts/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_calendar_event_view_and_manage_toggle(self):
        now = timezone.now()
        Event.all_objects.create(
            company=self.company,
            owner=self.other_user,
            title="Outro",
            start_datetime=now,
            end_datetime=now + timezone.timedelta(hours=1),
            is_all_day=False,
            color_category="blue",
        )
        Event.all_objects.create(
            company=self.company,
            owner=self.subject_user,
            title="Meu",
            start_datetime=now,
            end_datetime=now + timezone.timedelta(hours=1),
            is_all_day=False,
            color_category="blue",
        )

        self.as_company(self.subject_user)
        res = self.client.get("/api/calendar/events/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["calendar.event_view"])
        self.as_company(self.subject_user)
        res = self.client.get("/api/calendar/events/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["title"], "Meu")

        res = self.client.post(
            "/api/calendar/events/",
            {
                "title": "Novo",
                "start_datetime": now.isoformat(),
                "end_datetime": (now + timezone.timedelta(hours=1)).isoformat(),
                "is_all_day": False,
                "color_category": "blue",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_settings_api_keys_manage_toggle(self):
        APIKey.objects.create(company=self.company, name="k1", prefix="testprefix00000001", hashed_key="x" * 64)

        self.as_company(self.subject_user)
        res = self.client.get("/api/api-keys/keys/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["settings.api_keys_manage"])
        refreshed_user = User.all_objects.select_related("role").get(id=self.subject_user.id)
        self.assertIn("settings.api_keys_manage", refreshed_user.role.permissions)
        self.as_company(self.subject_user)
        res = self.client.get("/api/api-keys/keys/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.update_subject_role_permissions([])
        self.as_company(self.subject_user)
        res = self.client.get("/api/api-keys/keys/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_settings_webhooks_manage_toggle(self):
        WebhookSubscription.objects.create(company=self.company, url="https://example.com", events=["article.created"])

        self.as_company(self.subject_user)
        res = self.client.get("/api/webhooks/subscriptions/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["settings.webhooks_manage"])
        self.as_company(self.subject_user)
        res = self.client.get("/api/webhooks/subscriptions/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.update_subject_role_permissions([])
        self.as_company(self.subject_user)
        res = self.client.get("/api/webhooks/subscriptions/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_settings_manage_toggle_affects_modules_and_ldap(self):
        tm = TenantModule.all_objects.filter(company=self.company).first()
        if not tm:
            tm = TenantModule.all_objects.create(company=self.company, module=self.crm_module, is_active=True)

        LDAPConfig.objects.create(company=self.company, enabled=False, server_uri="ldap://example.com", bind_dn="cn=admin")

        self.as_company(self.subject_user)
        res = self.client.patch(f"/api/modules/my-modules/{tm.id}/", {"is_active": False}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.get("/api/core/ldap-config/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["admin.settings_manage"])
        self.as_company(self.subject_user)
        res = self.client.patch(f"/api/modules/my-modules/{tm.id}/", {"is_active": False}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = self.client.get("/api/core/ldap-config/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_admin_view_dashboard_toggle_affects_audit_and_stats(self):
        AuditLog.objects.create(company=self.company, user=self.admin_user, action="create", resource="X", resource_id="1", details={})

        self.as_company(self.subject_user)
        res = self.client.get("/api/core/audit-logs/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.client.get("/api/core/dashboard/stats/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.update_subject_role_permissions(["admin.view_dashboard"])
        self.as_company(self.subject_user)
        res = self.client.get("/api/core/audit-logs/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = self.client.get("/api/core/dashboard/stats/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
