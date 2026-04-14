from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Invitation, Role
from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature

User = get_user_model()


class InvitationResendTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.company = Company.objects.create(name="Resend Corp", slug="resend-corp")
        # Role com permissão admin.user_manage (necessária após I-A3)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.user = User.objects.create_user(
            username="admin", email="admin@corp.com", password="pass", company=self.company, role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="resend-corp")

        member_role = Role.objects.create(company=self.company, name="Member")
        plan = Plan.objects.create(name="Test Plan", price="0.00")
        feat = Feature.objects.create(code="max_users", name="Max Users")
        PlanFeature.objects.create(plan=plan, feature=feat, value="100")
        License.objects.create(company=self.company, plan=plan, is_active=True)
        # Create invite via API to ensure consistent behavior
        res = self.client.post(
            "/api/accounts/invitations/", {"email": "new@corp.com", "role": member_role.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.invite = Invitation.objects.latest("created_at")

    def test_resend_invitation(self):
        url = f"/api/accounts/invitations/{self.invite.id}/resend/"
        res = self.client.post(url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
