from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.models import Company
from apps.messenger.models import Conversation
from config.asgi import application

User = get_user_model()


class MessengerWebsocketTest(TransactionTestCase):
    def setUp(self):
        self.company = Company.objects.create(name="WS Corp", slug="ws-corp")
        self.user = User.objects.create_user(
            username="ws_user", email="ws@ws.com", password="pwd", company=self.company
        )
        self.other_user = User.objects.create_user(
            username="other", email="ot@ws.com", password="pwd", company=self.company
        )

        self.conversation = Conversation.objects.create(company=self.company)
        self.conversation.participants.add(self.user)
        # other_user is NOT a participant

        token = RefreshToken.for_user(self.user)
        self.access_token = str(token.access_token)

        token_other = RefreshToken.for_user(self.other_user)
        self.other_token = str(token_other.access_token)

    async def test_connect_no_token(self):
        communicator = WebsocketCommunicator(application, f"/ws/chat/{self.conversation.id}/")
        connected, _subprotocol = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_connect_valid_token_participant(self):
        communicator = WebsocketCommunicator(application, f"/ws/chat/{self.conversation.id}/?token={self.access_token}")
        connected, _subprotocol = await communicator.connect()
        self.assertTrue(connected)

        await communicator.send_json_to({"type": "typing_status", "is_typing": True})

        await communicator.disconnect()

    async def test_connect_valid_token_non_participant(self):
        # User exists and has token, but is not in conversation
        communicator = WebsocketCommunicator(application, f"/ws/chat/{self.conversation.id}/?token={self.other_token}")
        connected, _subprotocol = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_connect_invalid_token(self):
        communicator = WebsocketCommunicator(application, f"/ws/chat/{self.conversation.id}/?token=invalid_token")
        connected, _subprotocol = await communicator.connect()
        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_receive_read_all_update(self):
        communicator = WebsocketCommunicator(application, f"/ws/chat/{self.conversation.id}/?token={self.access_token}")
        connected, _subprotocol = await communicator.connect()
        self.assertTrue(connected)

        channel_layer = get_channel_layer()
        group_name = f"chat_{self.company.slug}_{self.conversation.id}"
        await channel_layer.group_send(
            group_name,
            {
                "type": "read_all_update",
                "conversation_id": self.conversation.id,
                "user_id": self.user.id,
                "read_at": "2026-01-01T00:00:00Z",
            },
        )

        msg = await communicator.receive_json_from()
        self.assertEqual(msg["type"], "read_all")
        self.assertEqual(msg["conversation_id"], self.conversation.id)
        self.assertEqual(msg["user_id"], self.user.id)

        await communicator.disconnect()
