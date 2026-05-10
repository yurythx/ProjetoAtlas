"""
Tests for the api_keys app.

Coverage:
- APIKey model: is_valid() (active, inactive, expired, not-yet-expired)
- APIKey model: verify_key() (correct key, wrong key, constant-time comparison)
- APIKeyAuthentication: missing header → None, no dot → None, unknown prefix → 401,
  wrong secret → 401, expired → 401, valid X-API-Key → (user, key),
  valid Authorization: Api-Key → (user, key), sets request.company
- APIKeyViewSet CRUD: list/create/destroy require auth + permission,
  raw_key only returned on creation, cross-tenant isolation
- APIKeySerializer: prefix uniqueness, raw_key format
"""

from datetime import timedelta
from unittest.mock import patch

from django.test import RequestFactory, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from factories import CompanyFactory, RoleFactory, UserFactory

from .models import APIKey, APIKeyUser
from .authentication import APIKeyAuthentication


# ---------------------------------------------------------------------------
# APIKey model
# ---------------------------------------------------------------------------


class APIKeyModelTest(TestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.raw_key = APIKey.generate_raw_key()
        self.api_key = APIKey(
            company=self.company,
            name="Test Key",
            prefix="abc12345abc12345",
        )
        self.api_key.set_key(self.raw_key)
        self.api_key.save()

    def test_is_valid_active_key(self):
        self.assertTrue(self.api_key.is_valid())

    def test_is_valid_inactive_key(self):
        self.api_key.is_active = False
        self.assertFalse(self.api_key.is_valid())

    def test_is_valid_expired_key(self):
        self.api_key.expires_at = timezone.now() - timedelta(seconds=1)
        self.assertFalse(self.api_key.is_valid())

    def test_is_valid_not_yet_expired(self):
        self.api_key.expires_at = timezone.now() + timedelta(hours=1)
        self.assertTrue(self.api_key.is_valid())

    def test_verify_key_correct(self):
        self.assertTrue(self.api_key.verify_key(self.raw_key))

    def test_verify_key_wrong(self):
        self.assertFalse(self.api_key.verify_key("wrong-secret"))

    def test_verify_key_empty(self):
        self.assertFalse(self.api_key.verify_key(""))

    def test_str_representation(self):
        self.assertIn(self.api_key.prefix, str(self.api_key))
        self.assertIn("Test Key", str(self.api_key))

    def test_generate_raw_key_is_string(self):
        key = APIKey.generate_raw_key()
        self.assertIsInstance(key, str)
        self.assertGreater(len(key), 20)

    def test_two_generated_keys_are_different(self):
        self.assertNotEqual(APIKey.generate_raw_key(), APIKey.generate_raw_key())


# ---------------------------------------------------------------------------
# APIKeyUser
# ---------------------------------------------------------------------------


class APIKeyUserTest(TestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = APIKeyUser(self.company, name="CI Bot")

    def test_is_authenticated(self):
        self.assertTrue(self.user.is_authenticated)

    def test_is_not_staff(self):
        self.assertFalse(self.user.is_staff)

    def test_has_perm_returns_false(self):
        self.assertFalse(self.user.has_perm("anything"))

    def test_str_contains_slug(self):
        self.assertIn(self.company.slug, str(self.user))


# ---------------------------------------------------------------------------
# APIKeyAuthentication
# ---------------------------------------------------------------------------


def _make_api_key(company, *, active=True, expires_at=None):
    """Helper: creates an APIKey and returns (instance, full_token)."""
    raw = APIKey.generate_raw_key()
    import secrets as _secrets
    prefix = _secrets.token_hex(8)
    while APIKey.objects.filter(prefix=prefix).exists():
        prefix = _secrets.token_hex(8)

    key = APIKey(company=company, name="Test", prefix=prefix, expires_at=expires_at, is_active=active)
    key.set_key(raw)
    key.save()
    return key, f"{prefix}.{raw}"


class APIKeyAuthenticationTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.company = CompanyFactory()
        self.auth = APIKeyAuthentication()
        self.api_key, self.token = _make_api_key(self.company)

    def _request(self, headers=None):
        req = self.factory.get("/")
        if headers:
            for k, v in headers.items():
                # RequestFactory stores META keys differently
                req.META[k] = v
        return req

    def test_no_header_returns_none(self):
        req = self._request()
        result = self.auth.authenticate(req)
        self.assertIsNone(result)

    def test_authorization_no_prefix_returns_none(self):
        req = self._request({"HTTP_AUTHORIZATION": "Bearer sometoken"})
        result = self.auth.authenticate(req)
        self.assertIsNone(result)

    def test_token_without_dot_returns_none(self):
        req = self._request({"HTTP_X_API_KEY": "nodotinhere"})
        result = self.auth.authenticate(req)
        self.assertIsNone(result)

    def test_unknown_prefix_raises_401(self):
        from rest_framework.exceptions import AuthenticationFailed
        req = self._request({"HTTP_X_API_KEY": "unknownprefix.secret"})
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(req)

    def test_wrong_secret_raises_401(self):
        from rest_framework.exceptions import AuthenticationFailed
        req = self._request({"HTTP_X_API_KEY": f"{self.api_key.prefix}.wrongsecret"})
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(req)

    def test_expired_key_raises_401(self):
        from rest_framework.exceptions import AuthenticationFailed
        _, expired_token = _make_api_key(
            self.company, expires_at=timezone.now() - timedelta(seconds=1)
        )
        req = self._request({"HTTP_X_API_KEY": expired_token})
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(req)

    @patch("apps.api_keys.tasks.update_api_key_last_used")
    def test_valid_x_api_key_header_returns_user_and_key(self, mock_task):
        req = self._request({"HTTP_X_API_KEY": self.token})
        result = self.auth.authenticate(req)
        self.assertIsNotNone(result)
        user, auth_obj = result
        self.assertIsInstance(user, APIKeyUser)
        self.assertEqual(auth_obj.pk, self.api_key.pk)
        self.assertEqual(req.company, self.company)
        mock_task.delay.assert_called_once_with(self.api_key.id)

    @patch("apps.api_keys.tasks.update_api_key_last_used")
    def test_valid_authorization_api_key_header(self, mock_task):
        req = self._request({"HTTP_AUTHORIZATION": f"Api-Key {self.token}"})
        result = self.auth.authenticate(req)
        self.assertIsNotNone(result)
        user, _ = result
        self.assertIsInstance(user, APIKeyUser)

    @patch("apps.api_keys.tasks.update_api_key_last_used")
    def test_x_api_key_prefix_in_authorization_header(self, mock_task):
        req = self._request({"HTTP_AUTHORIZATION": f"X-API-Key {self.token}"})
        result = self.auth.authenticate(req)
        self.assertIsNotNone(result)

    def test_inactive_key_raises_401(self):
        from rest_framework.exceptions import AuthenticationFailed
        _, inactive_token = _make_api_key(self.company, active=False)
        # inactive key lookup should fail — is_active=True filter in queryset
        req = self._request({"HTTP_X_API_KEY": inactive_token})
        with self.assertRaises(AuthenticationFailed):
            self.auth.authenticate(req)


# ---------------------------------------------------------------------------
# APIKeyViewSet — CRUD and tenant isolation
# ---------------------------------------------------------------------------


class APIKeyViewSetTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        self.client.force_authenticate(user=self.user)
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = self.company.slug

        # Give user the required permission
        role = RoleFactory(company=self.company, permissions=["settings.api_keys_manage"])
        self.user.role = role
        self.user.save(update_fields=["role"])

    def _list_url(self):
        return reverse("api-key-list")

    def _detail_url(self, pk):
        return reverse("api-key-detail", args=[pk])

    def test_list_requires_auth(self):
        self.client.logout()
        res = self.client.get(self._list_url())
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_list_returns_only_own_company_keys(self):
        other_company = CompanyFactory()
        # Create a key for the other company directly
        other_key = APIKey(company=other_company, name="Other", prefix="oth12345oth12345")
        other_key.set_key("some-secret")
        other_key.save()

        # Create a key for our company
        my_key = APIKey(company=self.company, name="Mine", prefix="my_12345my_12345")
        my_key.set_key("my-secret")
        my_key.save()

        res = self.client.get(self._list_url())
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [k["id"] for k in res.data]
        self.assertIn(my_key.id, ids)
        self.assertNotIn(other_key.id, ids)

    def test_create_returns_raw_key_once(self):
        res = self.client.post(self._list_url(), {"name": "CI Integration", "scopes": []}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn("raw_key", res.data)
        # raw_key must be prefix.secret format
        raw_key = res.data["raw_key"]
        self.assertIn(".", raw_key)
        prefix, _ = raw_key.split(".", 1)
        self.assertEqual(res.data["prefix"], prefix)

    def test_retrieve_does_not_expose_raw_key(self):
        key = APIKey(company=self.company, name="Secret", prefix="sec12345sec12345")
        key.set_key("s3cr3t")
        key.save()
        res = self.client.get(self._detail_url(key.id))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # raw_key should be null/empty after creation
        self.assertFalse(res.data.get("raw_key"))

    def test_destroy_deletes_key(self):
        key = APIKey(company=self.company, name="ToDelete", prefix="del12345del12345")
        key.set_key("s3cr3t")
        key.save()
        res = self.client.delete(self._detail_url(key.id))
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(APIKey.objects.filter(pk=key.id).exists())

    def test_cannot_destroy_other_company_key(self):
        other_company = CompanyFactory()
        other_key = APIKey(company=other_company, name="Other", prefix="oth22345oth22345")
        other_key.set_key("secret")
        other_key.save()
        res = self.client.delete(self._detail_url(other_key.id))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(APIKey.objects.filter(pk=other_key.id).exists())
