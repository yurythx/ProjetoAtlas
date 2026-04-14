from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule
from config.asgi import application

User = get_user_model()


class ContactVisibilityTest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Vis Corp", slug="vis-corp")

        # Groups
        self.group_dev = Group.objects.create(name="Developers")
        self.group_hr = Group.objects.create(name="HR")

        # Users
        self.admin = User.objects.create_superuser(
            username="admin", email="admin@v.com", password="pwd", company=self.company
        )
        self.dev1 = User.objects.create_user(username="dev1", email="d1@v.com", password="pwd", company=self.company)
        self.dev2 = User.objects.create_user(username="dev2", email="d2@v.com", password="pwd", company=self.company)
        self.hr1 = User.objects.create_user(username="hr1", email="h1@v.com", password="pwd", company=self.company)
        self.loner = User.objects.create_user(username="loner", email="l@v.com", password="pwd", company=self.company)

        # Assign groups
        self.dev1.groups.add(self.group_dev)
        self.dev2.groups.add(self.group_dev)
        self.hr1.groups.add(self.group_hr)
        # loner has no groups

        # Enable module
        messenger = Module.objects.create(code="messenger", name="Messenger")
        TenantModule.objects.create(company=self.company, module=messenger, is_active=True)

        self.client.defaults["HTTP_X_COMPANY_SLUG"] = "vis-corp"

    def test_admin_sees_everyone(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/messenger/contacts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Admin sees all users except self
        # Total users: 5. Admin sees 4.
        self.assertEqual(len(response.data["results"]), 4)

    def test_dev_sees_devs(self):
        self.client.force_authenticate(user=self.dev1)
        response = self.client.get("/api/messenger/contacts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should see dev2 (same group). Should NOT see hr1 or loner.
        usernames = [u["username"] for u in response.data["results"]]
        self.assertIn("dev2", usernames)
        self.assertNotIn("hr1", usernames)
        self.assertNotIn("loner", usernames)

    def test_loner_sees_no_one(self):
        self.client.force_authenticate(user=self.loner)
        response = self.client.get("/api/messenger/contacts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 0)


class PresenceConsumerTest(TransactionTestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Pres Corp", slug="pres-corp")
        self.user = User.objects.create_user(username="p_user", email="p@p.com", password="pwd", company=self.company)

        token = RefreshToken.for_user(self.user)
        self.access_token = str(token.access_token)

    async def test_presence_flow(self):
        # 1. Connect
        communicator = WebsocketCommunicator(application, f"ws/presence/?token={self.access_token}")
        connected, _ = await communicator.connect()
        self.assertTrue(connected)

        # 2. Check cache (via broadcast message)
        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "presence_update")
        self.assertEqual(response["status"], "online")
        self.assertEqual(response["user_id"], self.user.id)

        # 3. Disconnect
        await communicator.disconnect()

    async def test_presence_broadcast(self):
        # User 1 connects
        comm1 = WebsocketCommunicator(application, f"ws/presence/?token={self.access_token}")
        await comm1.connect()
        # Consume own online message
        await comm1.receive_json_from()

        # User 2 connects
        user2 = await User.objects.acreate(username="p_user2", email="p2@p.com", password="pwd", company=self.company)
        token2 = await sync_to_async(RefreshToken.for_user)(user2)
        access_token2 = str(token2.access_token)

        comm2 = WebsocketCommunicator(application, f"ws/presence/?token={access_token2}")
        await comm2.connect()

        # User 2 receives own online message
        await comm2.receive_json_from()

        # User 1 should receive User 2's online message
        msg_to_1 = await comm1.receive_json_from()
        self.assertEqual(msg_to_1["user_id"], user2.id)
        self.assertEqual(msg_to_1["status"], "online")

        # User 2 disconnects
        await comm2.disconnect()

        # User 1 should receive User 2's offline message
        msg_to_1_offline = await comm1.receive_json_from()
        self.assertEqual(msg_to_1_offline["user_id"], user2.id)
        self.assertEqual(msg_to_1_offline["status"], "offline")

        await comm1.disconnect()
