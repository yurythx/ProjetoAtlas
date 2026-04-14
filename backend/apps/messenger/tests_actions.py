from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import Company
from apps.messenger.models import Conversation, Message, MessageDelivery, MessageRead
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class MessengerActionsTest(APITestCase):
    def setUp(self):
        # Company
        self.company = Company.objects.create(name="Tech Corp", slug="tech-corp")

        # Users
        self.alice = User.objects.create_user(username="alice", email="a@t.com", password="pwd", company=self.company)
        self.bob = User.objects.create_user(username="bob", email="b@t.com", password="pwd", company=self.company)
        self.eve = User.objects.create_user(username="eve", email="e@t.com", password="pwd", company=self.company)

        # Enable module
        messenger = Module.objects.create(code="messenger", name="Messenger")
        TenantModule.objects.create(company=self.company, module=messenger, is_active=True)

        # Authenticate Alice
        self.client.force_authenticate(user=self.alice)
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = "tech-corp"

    def test_create_conversation(self):
        """Test creating a conversation with another user"""
        data = {"target_username": "bob"}
        response = self.client.post("/api/messenger/conversations/", data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Conversation.objects.count(), 1)

        conv = Conversation.objects.first()
        self.assertEqual(conv.participants.count(), 2)  # Alice + Bob
        self.assertTrue(conv.participants.filter(username="alice").exists())
        self.assertTrue(conv.participants.filter(username="bob").exists())

    def test_send_message(self):
        """Test sending a message to a conversation"""
        # Create conversation first
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        data = {"content": "Hello Bob!"}
        response = self.client.post(f"/api/messenger/conversations/{conv.id}/send_message/", data, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Message.objects.first().content, "Hello Bob!")
        self.assertEqual(Message.objects.first().sender, self.alice)

    def test_list_messages(self):
        """Test retrieving messages from a conversation"""
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        Message.objects.create(company=self.company, conversation=conv, sender=self.alice, content="Hi")
        Message.objects.create(company=self.company, conversation=conv, sender=self.bob, content="Hello")

        response = self.client.get(f"/api/messenger/conversations/{conv.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should be paginated or list depending on view implementation.
        # View uses paginate_queryset, so likely returns { count, results: [] }
        # But if PAGE_SIZE not set, might be list. Let's check type.

        if isinstance(response.data, dict) and "results" in response.data:
            results = response.data["results"]
        else:
            results = response.data

        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["content"], "Hi")

    def test_send_message_not_participant(self):
        """Test that a non-participant cannot send messages"""
        # Conversation between Bob and Eve
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.bob, self.eve)

        # Alice tries to send
        data = {"content": "I am spying"}
        response = self.client.post(f"/api/messenger/conversations/{conv.id}/send_message/", data, format="json")

        # Should be 404 because get_queryset filters by participants
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_message_receipts_only_sender(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob, self.eve)

        msg = Message.objects.create(company=self.company, conversation=conv, sender=self.alice, content="Receipts")
        MessageDelivery.all_objects.create(company=self.company, message=msg, user=self.bob)
        MessageRead.all_objects.create(company=self.company, message=msg, user=self.bob)

        res = self.client.get(f"/api/messenger/messages/{msg.id}/receipts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["message_id"], msg.id)
        self.assertEqual(res.data["delivered_count"], 1)
        self.assertEqual(res.data["read_count"], 1)
        self.assertEqual(len(res.data["pending_delivered"]), 1)
        self.assertEqual(len(res.data["pending_read"]), 1)
        self.assertEqual(res.data["pending_delivered"][0]["user_id"], self.eve.id)
        self.assertEqual(res.data["pending_read"][0]["user_id"], self.eve.id)
        self.assertEqual(len(res.data["recipients"]), 2)

        self.client.force_authenticate(user=self.bob)
        res2 = self.client.get(f"/api/messenger/messages/{msg.id}/receipts/")
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_conversation_for_me_hides_only_for_requester(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        res_del = self.client.post(f"/api/messenger/conversations/{conv.id}/delete_for_me/", {}, format="json")
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)

        res_list = self.client.get("/api/messenger/conversations/")
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        data = (
            res_list.data["results"]
            if isinstance(res_list.data, dict) and "results" in res_list.data
            else res_list.data
        )
        self.assertEqual(len(data), 0)

        res_deleted = self.client.get("/api/messenger/conversations/deleted/")
        self.assertEqual(res_deleted.status_code, status.HTTP_200_OK)
        deleted_data = (
            res_deleted.data["results"]
            if isinstance(res_deleted.data, dict) and "results" in res_deleted.data
            else res_deleted.data
        )
        self.assertEqual(len(deleted_data), 1)
        self.assertEqual(deleted_data[0]["id"], conv.id)

        self.client.force_authenticate(user=self.bob)
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = "tech-corp"
        res_list_bob = self.client.get("/api/messenger/conversations/")
        self.assertEqual(res_list_bob.status_code, status.HTTP_200_OK)
        data_bob = (
            res_list_bob.data["results"]
            if isinstance(res_list_bob.data, dict) and "results" in res_list_bob.data
            else res_list_bob.data
        )
        self.assertEqual(len(data_bob), 1)
        self.assertEqual(data_bob[0]["id"], conv.id)

        res_deleted_bob = self.client.get("/api/messenger/conversations/deleted/")
        deleted_bob = (
            res_deleted_bob.data["results"]
            if isinstance(res_deleted_bob.data, dict) and "results" in res_deleted_bob.data
            else res_deleted_bob.data
        )
        self.assertEqual(len(deleted_bob), 0)

    def test_restore_conversation_for_me_makes_it_visible_again(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        self.client.post(f"/api/messenger/conversations/{conv.id}/delete_for_me/", {}, format="json")
        res_restore = self.client.post(f"/api/messenger/conversations/{conv.id}/restore_for_me/", {}, format="json")
        self.assertEqual(res_restore.status_code, status.HTTP_200_OK)

        res_list = self.client.get("/api/messenger/conversations/")
        data = (
            res_list.data["results"]
            if isinstance(res_list.data, dict) and "results" in res_list.data
            else res_list.data
        )
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], conv.id)

        res_deleted = self.client.get("/api/messenger/conversations/deleted/")
        deleted_data = (
            res_deleted.data["results"]
            if isinstance(res_deleted.data, dict) and "results" in res_deleted.data
            else res_deleted.data
        )
        self.assertEqual(len(deleted_data), 0)

    def test_delete_conversation_hard_delete_forbidden_for_non_staff(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        res = self.client.delete(f"/api/messenger/conversations/{conv.id}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_archive_conversation_for_me_moves_between_lists(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        res_arch = self.client.post(f"/api/messenger/conversations/{conv.id}/archive_for_me/", {}, format="json")
        self.assertEqual(res_arch.status_code, status.HTTP_200_OK)

        res_retrieve = self.client.get(f"/api/messenger/conversations/{conv.id}/")
        self.assertEqual(res_retrieve.status_code, status.HTTP_200_OK)

        res_list = self.client.get("/api/messenger/conversations/")
        data = (
            res_list.data["results"]
            if isinstance(res_list.data, dict) and "results" in res_list.data
            else res_list.data
        )
        self.assertEqual(len(data), 0)

        res_archived = self.client.get("/api/messenger/conversations/archived/")
        archived_data = (
            res_archived.data["results"]
            if isinstance(res_archived.data, dict) and "results" in res_archived.data
            else res_archived.data
        )
        self.assertEqual(len(archived_data), 1)
        self.assertEqual(archived_data[0]["id"], conv.id)

        res_unarch = self.client.post(f"/api/messenger/conversations/{conv.id}/unarchive_for_me/", {}, format="json")
        self.assertEqual(res_unarch.status_code, status.HTTP_200_OK)

        res_list2 = self.client.get("/api/messenger/conversations/")
        data2 = (
            res_list2.data["results"]
            if isinstance(res_list2.data, dict) and "results" in res_list2.data
            else res_list2.data
        )
        self.assertEqual(len(data2), 1)
        self.assertEqual(data2[0]["id"], conv.id)

    def test_retrieve_deleted_conversation_allowed(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        res_del = self.client.post(f"/api/messenger/conversations/{conv.id}/delete_for_me/", {}, format="json")
        self.assertEqual(res_del.status_code, status.HTTP_200_OK)

        res_retrieve = self.client.get(f"/api/messenger/conversations/{conv.id}/")
        self.assertEqual(res_retrieve.status_code, status.HTTP_200_OK)

    def test_clear_conversation_for_me_hides_history_and_last_message(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        self.client.post(f"/api/messenger/conversations/{conv.id}/send_message/", {"content": "Antes"}, format="json")
        res_list = self.client.get("/api/messenger/conversations/")
        data = (
            res_list.data["results"]
            if isinstance(res_list.data, dict) and "results" in res_list.data
            else res_list.data
        )
        self.assertEqual(data[0]["last_message"]["content"], "Antes")

        res_clear = self.client.post(f"/api/messenger/conversations/{conv.id}/clear_for_me/", {}, format="json")
        self.assertEqual(res_clear.status_code, status.HTTP_200_OK)

        res_msgs = self.client.get(f"/api/messenger/conversations/{conv.id}/messages/")
        msgs = (
            res_msgs.data["results"]
            if isinstance(res_msgs.data, dict) and "results" in res_msgs.data
            else res_msgs.data
        )
        self.assertEqual(len(msgs), 0)

        res_list2 = self.client.get("/api/messenger/conversations/")
        data2 = (
            res_list2.data["results"]
            if isinstance(res_list2.data, dict) and "results" in res_list2.data
            else res_list2.data
        )
        self.assertIsNone(data2[0]["last_message"])
        self.assertEqual(data2[0]["unread_count"], 0)

    def test_unclear_conversation_for_me_restores_history_visibility(self):
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.alice, self.bob)

        self.client.post(f"/api/messenger/conversations/{conv.id}/send_message/", {"content": "Antes"}, format="json")
        self.client.post(f"/api/messenger/conversations/{conv.id}/clear_for_me/", {}, format="json")
        res_unclear = self.client.post(f"/api/messenger/conversations/{conv.id}/unclear_for_me/", {}, format="json")
        self.assertEqual(res_unclear.status_code, status.HTTP_200_OK)

        res_msgs = self.client.get(f"/api/messenger/conversations/{conv.id}/messages/")
        msgs = (
            res_msgs.data["results"]
            if isinstance(res_msgs.data, dict) and "results" in res_msgs.data
            else res_msgs.data
        )
        self.assertEqual(len(msgs), 1)
