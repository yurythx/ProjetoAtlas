from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Invitation, Role
from apps.core.models import Company
from apps.licensing.models import Feature, License, Plan, PlanFeature

User = get_user_model()


class InvitationResendPermissionTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Perm Corp", slug="perm-corp")
        # Usuário SEM permissão (para testar 403)
        self.user = User.objects.create_user(
            username="user", email="user@corp.com", password="pass", company=self.company
        )
        # Role com permissão (para testar 200)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        plan = Plan.objects.create(name="Test Plan", price="0.00")
        feat = Feature.objects.create(code="max_users", name="Max Users")
        PlanFeature.objects.create(plan=plan, feature=feat, value="100")
        License.objects.create(company=self.company, plan=plan, is_active=True)
        # Criar convite com usuário admin
        self.user.role = self.admin_role
        self.user.save(update_fields=["role"])
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="perm-corp")
        member_role = Role.objects.create(company=self.company, name="Member")
        res = self.client.post(
            "/api/accounts/invitations/", {"email": "new@corp.com", "role": member_role.id}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.invite = Invitation.objects.latest("created_at")
        # Remover permissão para início do teste de proibição
        self.user.role = None
        self.user.save(update_fields=["role"])

    def test_resend_requires_permission(self):
        """A5: Usuário sem admin.user_manage não pode reenviar convite."""
        url = f"/api/accounts/invitations/{self.invite.id}/resend/"
        # Sem permissão — deve dar 403
        res_forbidden = self.client.post(url, {}, format="json")
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)
        # Com permissão — deve dar 200
        self.user.role = self.admin_role
        self.user.save(update_fields=["role"])
        res_ok = self.client.post(url, {}, format="json")
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
