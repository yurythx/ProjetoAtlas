from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company

User = get_user_model()


class BrandingAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Brand Corp", slug="brand-corp")
        self.user = User.all_objects.create_user(
            username="branduser", email="b@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="brand-corp")

    def test_current_branding_and_update_require_staff(self):
        # Get current branding
        res = self.client.get("/api/core/branding/current/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["company_name"], "Brand Corp")

        # Non-staff cannot update
        res_forbidden = self.client.put(
            "/api/core/branding/update_current/", {"company_name": "New Name"}, format="json"
        )
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Staff can update
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        res_ok = self.client.put("/api/core/branding/update_current/", {"company_name": "New Name"}, format="json")
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data["company_name"], "New Name")

    def test_email_config_get_and_put_require_staff_for_put(self):
        # GET returns default config
        res_get = self.client.get("/api/core/branding/email_config/")
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        self.assertIn("use_custom_smtp", res_get.data)

        # Non-staff PUT forbidden
        res_forbidden = self.client.put("/api/core/branding/email_config/", {"use_custom_smtp": True}, format="json")
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Staff PUT allowed
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff"])
        res_put = self.client.put(
            "/api/core/branding/email_config/",
            {
                "use_custom_smtp": True,
                "smtp_host": "localhost",
                "smtp_port": 1025,
                "from_email": "noreply@brandcorp.com",
            },
            format="json",
        )
        self.assertEqual(res_put.status_code, status.HTTP_200_OK)
        self.assertTrue(res_put.data["use_custom_smtp"])

        # test_smtp returns 400 when not fully configured or failing
        res_test = self.client.post("/api/core/branding/test_smtp/")
        self.assertIn(res_test.status_code, (status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST))
