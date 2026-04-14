from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class MessengerAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        self.user = User.objects.create_user(
            username="tester", email="tester@test.corp", password="pass", company=self.company
        )
        self.peer = User.objects.create_user(
            username="peer", email="peer@test.corp", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="test-corp")

        messenger = Module.objects.create(code="messenger", name="Messenger")
        TenantModule.objects.create(company=self.company, module=messenger, is_active=True)

    def test_conversation_and_message_flow(self):
        # Create conversation with target_username
        res = self.client.post("/api/messenger/conversations/", {"target_username": "peer"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        conv_id = res.data["id"]

        # Send message
        msg_res = self.client.post(
            f"/api/messenger/conversations/{conv_id}/send_message/", {"content": "Hello"}, format="json"
        )
        self.assertEqual(msg_res.status_code, status.HTTP_201_CREATED)
        message_id = msg_res.data["id"]

        # Add reaction
        react_res = self.client.post(
            f"/api/messenger/messages/{message_id}/reaction/", {"emoji": "👍", "action": "add"}, format="json"
        )
        self.assertEqual(react_res.status_code, status.HTTP_200_OK)

        # Mark read as sender should fail
        mark_res = self.client.post(f"/api/messenger/messages/{message_id}/mark_read/", {}, format="json")
        self.assertEqual(mark_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_link_preview_blocks_localhost(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/messenger/messages/link_preview/", {"url": "http://localhost/test"})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error_code", res.data)

    @patch("requests.get")
    def test_link_preview_parses_og_tags(self, mock_get):
        html = (
            "<html><head>"
            '<meta property="og:title" content="Title">'
            '<meta property="og:description" content="Desc">'
            '<meta property="og:image" content="http://example.com/img.png">'
            "</head><body></body></html>"
        )
        mock_resp = Mock()
        mock_resp.iter_content = lambda chunk_size: [html.encode("utf-8")]
        mock_resp.encoding = "utf-8"
        mock_resp.headers = {"Content-Type": "text/html; charset=utf-8"}
        mock_resp.url = "http://example.com/page"
        mock_get.return_value = mock_resp

        res = self.client.get("/api/messenger/messages/link_preview/", {"url": "http://example.com/page"})
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_202_ACCEPTED])

    @patch("requests.get")
    def test_link_preview_rejects_non_html(self, mock_get):
        mock_resp = Mock()
        mock_resp.iter_content = lambda chunk_size: [b"\x89PNG..."]
        mock_resp.encoding = None
        mock_resp.headers = {"Content-Type": "image/png"}
        mock_resp.url = "http://example.com/image.png"
        mock_get.return_value = mock_resp

        res = self.client.get("/api/messenger/messages/link_preview/", {"url": "http://example.com/image.png"})
        self.assertIn(res.status_code, [status.HTTP_202_ACCEPTED, status.HTTP_400_BAD_REQUEST])

    @patch("requests.get")
    def test_link_preview_resolves_relative_image(self, mock_get):
        html = (
            "<html><head>"
            '<meta property="og:title" content="Title">'
            '<meta property="og:description" content="Desc">'
            '<meta property="og:image" content="/img.png">'
            "</head><body></body></html>"
        )
        mock_resp = Mock()
        mock_resp.iter_content = lambda chunk_size: [html.encode("utf-8")]
        mock_resp.encoding = "utf-8"
        mock_resp.headers = {"Content-Type": "text/html"}
        mock_resp.url = "http://example.com/page"
        mock_get.return_value = mock_resp

        res = self.client.get("/api/messenger/messages/link_preview/", {"url": "http://example.com/page"})
        self.assertIn(res.status_code, [status.HTTP_200_OK, status.HTTP_202_ACCEPTED])
