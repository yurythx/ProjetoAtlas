from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.calendar.models import Event
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class CalendarRBACTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Empresa A", slug="empresa-a")

        self.calendar_module, _ = Module.objects.get_or_create(
            code="calendar",
            defaults={"name": "Calendário", "description": "Agenda e eventos"},
        )
        TenantModule.objects.get_or_create(company=self.company, module=self.calendar_module, defaults={"is_active": True})

        self.role_no_access = Role.all_objects.create(company=self.company, name="Sem Acesso", permissions=[])
        self.role_view_only = Role.all_objects.create(company=self.company, name="Somente Ver", permissions=["calendar.event_view"])
        self.role_manage = Role.all_objects.create(
            company=self.company, name="Gerenciar", permissions=["calendar.event_view", "calendar.event_manage"]
        )

        self.user_no_access = User.all_objects.create_user(
            username="u0", password="password", company=self.company, role=self.role_no_access
        )
        self.user_view_only = User.all_objects.create_user(
            username="u1", password="password", company=self.company, role=self.role_view_only
        )
        self.user_manage = User.all_objects.create_user(
            username="u2", password="password", company=self.company, role=self.role_manage
        )

        self.other_company = Company.objects.create(name="Empresa B", slug="empresa-b")
        TenantModule.objects.get_or_create(company=self.other_company, module=self.calendar_module, defaults={"is_active": True})

    def auth(self, user, company):
        self.client.force_authenticate(user=user)
        self.client.credentials(HTTP_X_COMPANY_SLUG=company.slug)

    def test_user_without_view_permission_is_denied(self):
        self.auth(self.user_no_access, self.company)
        response = self.client.get("/api/calendar/events/")
        self.assertEqual(response.status_code, 403)

    def test_view_only_user_can_list_own_events_but_cannot_create(self):
        self.auth(self.user_view_only, self.company)
        Event.all_objects.create(
            company=self.company,
            owner=self.user_view_only,
            title="Meu evento",
            start_datetime=timezone.now(),
            end_datetime=timezone.now() + timezone.timedelta(hours=1),
            is_all_day=False,
            color_category="blue",
        )
        Event.all_objects.create(
            company=self.company,
            owner=self.user_manage,
            title="Evento do outro",
            start_datetime=timezone.now(),
            end_datetime=timezone.now() + timezone.timedelta(hours=1),
            is_all_day=False,
            color_category="blue",
        )

        response = self.client.get("/api/calendar/events/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "Meu evento")

        response = self.client.post(
            "/api/calendar/events/",
            {
                "title": "Novo",
                "start_datetime": timezone.now().isoformat(),
                "end_datetime": (timezone.now() + timezone.timedelta(hours=1)).isoformat(),
                "is_all_day": False,
                "color_category": "blue",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_manage_user_can_create_and_is_scoped_by_company(self):
        self.auth(self.user_manage, self.company)
        payload = {
            "title": "Evento A",
            "start_datetime": timezone.now().isoformat(),
            "end_datetime": (timezone.now() + timezone.timedelta(hours=1)).isoformat(),
            "is_all_day": False,
            "color_category": "blue",
        }
        response = self.client.post("/api/calendar/events/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["company"], self.company.id)

        self.auth(self.user_manage, self.other_company)
        response = self.client.get("/api/calendar/events/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)

