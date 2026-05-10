from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company
from apps.webhooks.models import WebhookDelivery, WebhookSubscription
from apps.webhooks.tasks import dispatch_webhook
from factories import CompanyFactory, UserFactory


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class WebhookDispatchSecurityTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Acme", slug="acme")
        self.payload = {"x": 1}

    def test_block_invalid_scheme(self):
        sub = WebhookSubscription.objects.create(
            company=self.company, url="javascript:alert(1)", secret="s", is_active=True, events=["article.created"]
        )
        res = dispatch_webhook.apply(args=(sub.id, "article.created", self.payload)).get()
        self.assertIn("Invalid webhook URL", res)

    def test_block_localhost(self):
        sub = WebhookSubscription.objects.create(
            company=self.company,
            url="http://localhost:8000/hook",
            secret="s",
            is_active=True,
            events=["article.created"],
        )
        res = dispatch_webhook.apply(args=(sub.id, "article.created", self.payload)).get()
        self.assertIn("host not allowed", res)

    def test_block_private_ip(self):
        sub = WebhookSubscription.objects.create(
            company=self.company, url="http://192.168.0.10/hook", secret="s", is_active=True, events=["article.created"]
        )
        res = dispatch_webhook.apply(args=(sub.id, "article.created", self.payload)).get()
        self.assertIn("IP not allowed", res)

    @patch("apps.webhooks.tasks.requests.post")
    def test_allow_valid_external(self, mock_post):
        sub = WebhookSubscription.objects.create(
            company=self.company, url="http://example.com/hook", secret="s", is_active=True, events=["article.created"]
        )
        mock_resp = Mock()
        mock_resp.url = "http://example.com/hook"
        mock_resp.status_code = 200
        mock_resp.text = "ok"
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        res = dispatch_webhook.apply(args=(sub.id, "article.created", self.payload)).get()
        self.assertIn("Webhook sent", res)
        mock_post.assert_called_once()


# ---------------------------------------------------------------------------
# Retry delivery endpoint
# ---------------------------------------------------------------------------


class WebhookRetryDeliveryTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        self.client.force_authenticate(user=self.user)
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = self.company.slug

        self.subscription = WebhookSubscription.objects.create(
            company=self.company,
            url="https://example.com/hook",
            secret="test-secret",
            is_active=True,
            events=["article.created"],
        )
        self.delivery = WebhookDelivery.objects.create(
            company=self.company,
            subscription=self.subscription,
            event_name="article.created",
            status_code=500,
            success=False,
            request_payload={"article_id": 1},
            response_body="Internal Server Error",
            attempt_number=1,
        )

    def _retry_url(self):
        return reverse("webhook-subscription-retry-delivery", args=[self.subscription.id])

    def test_retry_requires_auth(self):
        self.client.logout()
        res = self.client.post(self._retry_url(), {"delivery_id": self.delivery.id})
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    @patch("apps.webhooks.views.dispatch_webhook")
    def test_retry_enqueues_task_and_returns_202(self, mock_task):
        res = self.client.post(self._retry_url(), {"delivery_id": self.delivery.id})
        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        mock_task.delay.assert_called_once_with(
            self.subscription.id, self.delivery.event_name, self.delivery.request_payload
        )

    def test_retry_without_delivery_id_returns_400(self):
        res = self.client.post(self._retry_url(), {})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_retry_with_wrong_subscription_returns_404(self):
        other_company = CompanyFactory()
        other_sub = WebhookSubscription.objects.create(
            company=other_company,
            url="https://other.com/hook",
            secret="x",
            is_active=True,
            events=[],
        )
        url = reverse("webhook-subscription-retry-delivery", args=[other_sub.id])
        res = self.client.post(url, {"delivery_id": self.delivery.id})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_retry_with_delivery_from_wrong_subscription_returns_404(self):
        other_sub = WebhookSubscription.objects.create(
            company=self.company,
            url="https://other.com/hook",
            secret="x",
            is_active=True,
            events=[],
        )
        url = reverse("webhook-subscription-retry-delivery", args=[other_sub.id])
        res = self.client.post(url, {"delivery_id": self.delivery.id})
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
