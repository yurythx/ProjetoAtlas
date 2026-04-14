from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company


class PasswordValidationTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Pwd Corp", slug="pwd-corp")
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = "pwd-corp"

    def test_weak_password_rejected_on_registration(self):
        payload = {
            "username": "weakuser",
            "email": "weak@corp.com",
            "password": "password",  # Common password should be rejected
            "first_name": "Weak",
            "last_name": "User",
            "company_slug": "pwd-corp",
        }
        res = self.client.post("/api/accounts/register/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
