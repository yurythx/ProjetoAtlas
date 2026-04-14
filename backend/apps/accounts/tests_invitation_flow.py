from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Invitation, Role
from apps.core.models import Company
from apps.crm.models import CRMGroup
from apps.licensing.models import Feature, License, Plan, PlanFeature

User = get_user_model()


class InvitationFlowTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Invite Corp", slug="invite-corp")
        # Role com permissão admin.user_manage (necessária após I-A3)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.user = User.objects.create_user(
            username="inviter", email="i@corp.com", password="pass", company=self.company, role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="invite-corp")

        self.role = Role.objects.create(company=self.company, name="Member")
        plan = Plan.objects.create(name="Test Plan", price="0.00")
        feat = Feature.objects.create(code="max_users", name="Max Users")
        PlanFeature.objects.create(plan=plan, feature=feat, value="100")
        License.objects.create(company=self.company, plan=plan, is_active=True)

    def test_invitation_expired_on_accept(self):
        # Create invitation
        res = self.client.post(
            "/api/accounts/invitations/", {"email": "new@corp.com", "role": self.role.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        inv = Invitation.objects.latest("created_at")
        # Force expiration to past
        inv.expires_at = timezone.now() - timezone.timedelta(days=1)
        inv.save(update_fields=["expires_at"])

        # Attempt accept
        self.client.logout()
        payload = {
            "token": inv.token,
            "first_name": "Late",
            "last_name": "User",
            "password": "secretpass",
            "confirm_password": "secretpass",
        }
        res2 = self.client.post("/api/accounts/invitations/accept/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invitation_assigns_crm_groups_on_accept(self):
        group = CRMGroup.all_objects.create(company=self.company, name="Suporte", slug="suporte")
        self.assertTrue(CRMGroup.all_objects.filter(id=group.id, company=self.company).exists())
        res = self.client.post(
            "/api/accounts/invitations/",
            {"email": "groups@corp.com", "role": self.role.id, "crm_groups": [group.id]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        inv = Invitation.objects.latest("created_at")
        self.assertEqual(
            list(inv.crm_groups.through.objects.filter(invitation_id=inv.id).values_list("crmgroup_id", flat=True)),
            [group.id],
        )

        self.client.logout()
        payload = {
            "token": inv.token,
            "first_name": "Group",
            "last_name": "User",
            "password": "secretpass",
            "confirm_password": "secretpass",
        }
        res2 = self.client.post("/api/accounts/invitations/accept/", payload, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

        created = User.all_objects.get(email="groups@corp.com")
        self.assertEqual(
            list(created.crm_groups.through.objects.filter(user_id=created.id).values_list("crmgroup_id", flat=True)),
            [group.id],
        )
