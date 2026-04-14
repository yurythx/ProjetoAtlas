from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from apps.core.models import Company
from apps.webhooks.models import WebhookSubscription
from apps.webhooks.tasks import dispatch_webhook


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
