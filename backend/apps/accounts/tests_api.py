from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Invitation, Role, UserThemePreference
from apps.core.models import Company

User = get_user_model()


class AccountsAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        # Set generous limits for testing
        from apps.licensing.models import Feature, License, Plan, PlanFeature

        plan = Plan.objects.create(name="Enterprise")
        feat = Feature.objects.create(code="max_users", name="Max Users")
        PlanFeature.objects.create(plan=plan, feature=feat, value="100")
        License.objects.create(company=self.company, plan=plan, is_active=True)

        # Role com permissão admin.user_manage (necessária após A7/I-A2/I-A3)
        self.admin_role = Role.objects.create(company=self.company, name="Admin", permissions=["admin.user_manage"])
        self.user = User.objects.create_user(
            username="tester", email="tester@test.corp", password="pass", company=self.company, role=self.admin_role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="test-corp")

    def test_token_obtain_pair(self):
        self.client.logout()
        res = self.client.post("/api/accounts/token/", {"username": "tester", "password": "pass"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)

    def test_user_me_get_and_patch(self):
        res = self.client.get("/api/accounts/users/me/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["username"], "tester")
        # Patch
        res2 = self.client.patch("/api/accounts/users/me/", {"first_name": "Test"}, format="json")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data["first_name"], "Test")

    def test_role_crud_and_protect_system_role(self):
        # Create role
        res = self.client.post(
            "/api/accounts/roles/",
            {"name": "Editor Custom", "permissions": ["articles.comment_moderate"]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        role_id = res.data["id"]
        # Delete allowed
        del_res = self.client.delete(f"/api/accounts/roles/{role_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        # System role cannot be deleted
        sys_role = Role.objects.create(company=self.company, name="System", is_system_role=True)
        res_forbidden = self.client.delete(f"/api/accounts/roles/{sys_role.id}/")
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_wildcard_permission_allows_role_guarded_endpoints(self):
        wild_role = Role.objects.create(company=self.company, name="Wild", permissions=["*"])
        self.user.role = wild_role
        self.user.save(update_fields=["role"])

        res = self.client.get("/api/accounts/users/")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.content)

    def test_invitation_create_and_accept_flow(self):
        # Create role
        role = Role.objects.create(company=self.company, name="Member")
        # Create invitation
        res = self.client.post("/api/accounts/invitations/", {"email": "new@test.corp", "role": role.id}, format="json")
        if res.status_code != status.HTTP_201_CREATED:
            print(f"Invitation Error: {res.data}")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        inv = Invitation.objects.latest("created_at")
        self.assertEqual(inv.email, "new@test.corp")
        # Accept invitation via service endpoint
        self.client.logout()
        accept_payload = {
            "token": inv.token,
            "first_name": "New",
            "last_name": "Member",
            "password": "secretpass",
            "confirm_password": "secretpass",
        }
        res2 = self.client.post("/api/accounts/invitations/accept/", accept_payload, format="json")
        self.assertIn(res2.status_code, (status.HTTP_201_CREATED, status.HTTP_200_OK))

    def test_theme_preference_update(self):
        # Ensure preference object exists
        _, _ = UserThemePreference.objects.get_or_create(
            user=self.user,
            defaults={"theme_palette": "blue", "use_tenant_theme": True, "dark_mode_preference": "system"},
        )
        # Update via hypothetical endpoint
        res = self.client.put(
            "/api/accounts/preferences/theme/update_current/",
            {"theme_palette": "royal-purple", "use_tenant_theme": False, "dark_mode_preference": "dark"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_notification_preference_update(self):
        res = self.client.get("/api/accounts/preferences/notifications/current/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get("notify_moderation_comment_pending"))
        self.assertTrue(res.data.get("notify_moderation_reply_pending"))
        self.assertTrue(res.data.get("notify_reply_approved_single"))
        self.assertTrue(res.data.get("notify_reply_approved_thread"))

        res2 = self.client.put(
            "/api/accounts/preferences/notifications/update_current/",
            {
                "notify_moderation_comment_pending": False,
                "notify_moderation_reply_pending": False,
                "notify_reply_approved_single": False,
                "notify_reply_approved_thread": False,
            },
            format="json",
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertFalse(res2.data.get("notify_moderation_comment_pending"))
        self.assertFalse(res2.data.get("notify_moderation_reply_pending"))
        self.assertFalse(res2.data.get("notify_reply_approved_single"))
        self.assertFalse(res2.data.get("notify_reply_approved_thread"))

    def test_user_update_with_role_and_avatar(self):
        # Usar self.admin_role já criado no setUp (evita UNIQUE constraint em name+company)
        role = self.admin_role

        # Create a temporary image file for avatar upload
        import tempfile

        from PIL import Image

        image = Image.new("RGB", (100, 100))
        tmp_file = tempfile.NamedTemporaryFile(suffix=".jpg")
        image.save(tmp_file)
        tmp_file.seek(0)

        # Prepare multipart/form-data payload
        data = {"first_name": "Updated Name", "role": role.id, "avatar": tmp_file}

        # Perform PATCH request
        # Note: We use the user's ID in the URL
        url = f"/api/accounts/users/{self.user.id}/"
        res = self.client.patch(url, data, format="multipart")

        if res.status_code != status.HTTP_200_OK:
            print(f"User Update Error: {res.data}")

        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify database update
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated Name")
        self.assertEqual(self.user.role.id, role.id)
        self.assertTrue(bool(self.user.avatar))  # Check if avatar exists

        tmp_file.close()

    def test_user_update_password(self):
        url = f"/api/accounts/users/{self.user.id}/"
        data = {"password": "newpassword123"}
        res = self.client.patch(url, data, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify login with new password
        self.client.logout()
        login_res = self.client.post(
            "/api/accounts/token/", {"username": self.user.username, "password": "newpassword123"}, format="json"
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)

    # --- Novos Testes de Correções ---

    def test_role_cross_tenant_isolation(self):
        """A1: Usuário de tenant A não deve ver/editar roles de tenant B."""
        # Cria empresa B e um usuário nela
        company_b = Company.objects.create(name="Tenant B", slug="tenant-b")
        role_b = Role.objects.create(company=company_b, name="RoleDeTenantB")

        # Nosso usuário (tenant A) não deve enxergar a role de tenant B
        res = self.client.get("/api/accounts/roles/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # InvitationViewSet.pagination_class = None — resposta é lista direta
        roles_data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        role_ids = [r["id"] for r in roles_data]
        self.assertNotIn(role_b.id, role_ids, "Cross-tenant: role de outro tenant não deve aparecer na listagem")

        # Não deve conseguir editar a role de tenant B diretamente
        res_patch = self.client.patch(f"/api/accounts/roles/{role_b.id}/", {"name": "Hacked"}, format="json")
        self.assertIn(
            res_patch.status_code,
            (status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN),
            "Cross-tenant: não deve conseguir editar role de outro tenant",
        )

    def test_invitation_cross_tenant_isolation(self):
        """A2: Usuário de tenant A não deve ver convites de tenant B."""
        company_b = Company.objects.create(name="Tenant B", slug="tenant-b-inv")
        role_b = Role.objects.create(company=company_b, name="RoleB")
        Invitation.objects.create(company=company_b, email="hacker@tenantb.com", role=role_b, status="pending")

        res = self.client.get("/api/accounts/invitations/")
        # InvitationViewSet.pagination_class = None — resposta é lista direta
        invites_data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        emails_returned = [i["email"] for i in invites_data]
        self.assertNotIn(
            "hacker@tenantb.com", emails_returned, "Cross-tenant: convite de outro tenant não deve aparecer"
        )

    def test_non_admin_cannot_create_users(self):
        """A7: Usuário sem 'admin.user_manage' não pode criar novos usuários."""
        # Remove permissão do usuário para testar o bloqueio
        self.user.role = None
        self.user.save(update_fields=["role"])
        res = self.client.post(
            "/api/accounts/users/",
            {
                "username": "new_unauthorized",
                "email": "new@test.corp",
                "password": "pass1234",
                "first_name": "New",
                "last_name": "User",
            },
            format="json",
        )
        self.assertEqual(
            res.status_code, status.HTTP_403_FORBIDDEN, "Usuário sem permissão não deve conseguir criar usuários"
        )
        # Restaurar permissão para não afetar outros testes
        self.user.role = self.admin_role
        self.user.save(update_fields=["role"])

    def test_accept_invitation_duplicate_email_two_tenants(self):
        """A6: Mesmo email pode aceitar convites de dois tenants sem IntegrityError."""
        company_b = Company.objects.create(name="Tenant B", slug="tenant-b-dup")
        role_a = Role.objects.create(company=self.company, name="DupMemberA")
        role_b = Role.objects.create(company=company_b, name="DupMemberB")

        # Convite do tenant A
        inv_a = Invitation.objects.create(company=self.company, email="dup@test.com", role=role_a, status="pending")

        # Convite do tenant B com o mesmo email
        inv_b = Invitation.objects.create(company=company_b, email="dup@test.com", role=role_b, status="pending")

        self.client.logout()

        # Aceitar o primeiro convite
        res_a = self.client.post(
            "/api/accounts/invitations/accept/",
            {
                "token": inv_a.token,
                "first_name": "Dup",
                "last_name": "User",
                "password": "securepass",
                "confirm_password": "securepass",
            },
            format="json",
        )
        self.assertIn(
            res_a.status_code, (status.HTTP_200_OK, status.HTTP_201_CREATED), f"Primeiro aceite falhou: {res_a.data}"
        )

        # Aceitar o segundo convite com o mesmo email — não deve dar IntegrityError
        res_b = self.client.post(
            "/api/accounts/invitations/accept/",
            {
                "token": inv_b.token,
                "first_name": "Dup",
                "last_name": "User",
                "password": "securepass",
                "confirm_password": "securepass",
            },
            format="json",
        )
        self.assertIn(
            res_b.status_code,
            (status.HTTP_200_OK, status.HTTP_201_CREATED),
            f"Segundo aceite falhou (username duplicado?): {res_b.data}",
        )

        # Ambos os usuários devem existir com usernames únicos
        from apps.accounts.models import User as UserModel

        user_a = UserModel.all_objects.filter(email="dup@test.com", company=self.company).first()
        user_b = UserModel.all_objects.filter(email="dup@test.com", company=company_b).first()
        self.assertIsNotNone(user_a, "Usuário do tenant A deve existir")
        self.assertIsNotNone(user_b, "Usuário do tenant B deve existir")
        self.assertNotEqual(user_a.username, user_b.username, "Usernames devem ser únicos mesmo com o mesmo email")
