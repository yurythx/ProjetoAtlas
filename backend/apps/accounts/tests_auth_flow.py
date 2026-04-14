from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.core.models import Company

User = get_user_model()


class AccountsAuthFlowTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Auth Corp", slug="auth-corp")
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = "auth-corp"

    def test_registration_and_token_claims(self):
        payload = {
            "username": "newuser",
            "email": "new@corp.com",
            "password": "secretpass",
            "first_name": "New",
            "last_name": "User",
            "company_slug": "auth-corp",
        }
        res = self.client.post("/api/accounts/register/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # Login to get token pair
        token_res = self.client.post(
            "/api/accounts/token/", {"username": "newuser", "password": "secretpass"}, format="json"
        )
        self.assertEqual(token_res.status_code, status.HTTP_200_OK)
        access = token_res.data["access"]
        self.assertTrue(access)

        # Optionally decode JWT to check claims; here we just hit the refresh pair for flow coverage
        refresh = token_res.data["refresh"]
        self.assertTrue(refresh)

        # Validate custom claims in access token
        at = AccessToken(access)
        self.assertEqual(at["username"], "newuser")
        self.assertEqual(at["email"], "new@corp.com")
        self.assertEqual(at["first_name"], "New")
        self.assertEqual(at["last_name"], "User")
        self.assertEqual(at["company_slug"], "auth-corp")

    @patch("apps.accounts.services.AccountService.request_password_reset", return_value=True)
    def test_password_reset_request(self, mock_request):
        # Create user
        User.objects.create_user(username="resetuser", email="reset@corp.com", password="pass", company=self.company)
        res = self.client.post("/api/accounts/password-reset/", {"email": "reset@corp.com"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    @patch("apps.accounts.services.AccountService.confirm_password_reset", return_value=True)
    def test_password_reset_confirm_ok(self, mock_confirm):
        res = self.client.post(
            "/api/accounts/password-reset/confirm/",
            {"uid": "uid", "token": "token", "new_password": "newsecret", "confirm_password": "newsecret"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_password_reset_confirm_mismatch(self):
        res = self.client.post(
            "/api/accounts/password-reset/confirm/",
            {"uid": "uid", "token": "token", "new_password": "newsecret", "confirm_password": "different"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
