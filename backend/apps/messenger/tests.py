"""
Tests for the Messenger application.

Covers:
  - Multi-tenant isolation (existing)
  - Message persistence via API
  - Message editing saves content (regression for serializer.save bug)
  - Group creation with participants (regression for participant_usernames bug)
  - Soft delete (is_deleted=True, content cleared)
  - Mute / unmute / pin / unpin preferences
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.models import AuditLog
from apps.messenger.models import ConversationPreference, Message
from apps.module_manager.models import Module, TenantModule
from factories import CompanyFactory, ConversationFactory, UserFactory


class MessengerBaseTest(APITestCase):
    """Shared setup for all messenger tests."""

    def setUp(self):
        self.company_a = CompanyFactory(slug="company-a")
        self.user_a1 = UserFactory(username="u_a1", company=self.company_a)
        self.user_a2 = UserFactory(username="u_a2", company=self.company_a)

        self.company_b = CompanyFactory(slug="company-b")
        self.user_b1 = UserFactory(username="u_b1", company=self.company_b)

        # Enable messenger module for both tenants
        messenger_module, _ = Module.objects.get_or_create(code="messenger", defaults={"name": "Messenger"})
        TenantModule.objects.get_or_create(company=self.company_a, module=messenger_module, defaults={"is_active": True})
        TenantModule.objects.get_or_create(company=self.company_b, module=messenger_module, defaults={"is_active": True})

        self.conv_a = ConversationFactory(
            company=self.company_a, participants=[self.user_a1, self.user_a2]
        )
        self.conv_b = ConversationFactory(
            company=self.company_b, participants=[self.user_b1]
        )

    def auth(self, user, company_slug):
        self.client.force_authenticate(user=user)
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = company_slug


class MessengerIsolationTest(MessengerBaseTest):
    """Tests for multi-tenant data isolation."""

    def test_isolation_list(self):
        # User A1 should only see conversations from Company A
        self.auth(self.user_a1, "company-a")
        response = self.client.get("/api/messenger/conversations/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], self.conv_a.id)

        # User B1 should only see conversations from Company B
        self.auth(self.user_b1, "company-b")
        response = self.client.get("/api/messenger/conversations/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["id"], self.conv_b.id)

    def test_cross_tenant_access_denied(self):
        # User A1 tries to access Conversation B via ID
        self.auth(self.user_a1, "company-a")
        response = self.client.get(f"/api/messenger/conversations/{self.conv_b.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class MessengerMessagingTest(MessengerBaseTest):
    """Tests for core messaging flows."""

    def test_send_message_persists_to_db(self):
        """POSTing to send_message must create a DB record."""
        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/conversations/{self.conv_a.id}/send_message/"
        response = self.client.post(url, {"content": "Hello World"})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            Message.objects.filter(conversation=self.conv_a, content="Hello World").exists(),
            "Message must be persisted in the DB after send_message",
        )

    def test_global_search_includes_conversation_metadata(self):
        self.auth(self.user_a1, "company-a")

        group_conv = Conversation.objects.create(company=self.company_a, is_group=True, title="Equipe")
        group_conv.participants.add(self.user_a1, self.user_a2)

        m1 = Message.objects.create(
            company=self.company_a, conversation=self.conv_a, sender=self.user_a1, content="FindMe"
        )
        m2 = Message.objects.create(
            company=self.company_a, conversation=group_conv, sender=self.user_a2, content="FindMe too"
        )

        res = self.client.get("/api/messenger/conversations/search/?q=FindMe")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data["results"] if isinstance(res.data, dict) and "results" in res.data else res.data
        self.assertIsInstance(data, list)

        by_id = {m["id"]: m for m in data}
        self.assertIn(m1.id, by_id)
        self.assertIn(m2.id, by_id)

        one_to_one = by_id[m1.id]
        self.assertIn("conversation_title", one_to_one)
        self.assertIn("conversation_is_group", one_to_one)
        self.assertIn("conversation_participants_list", one_to_one)
        self.assertEqual(one_to_one["conversation_is_group"], False)
        self.assertIsNone(one_to_one["conversation_title"])
        self.assertIn("u_a1", one_to_one["conversation_participants_list"])
        self.assertIn("u_a2", one_to_one["conversation_participants_list"])

        grp = by_id[m2.id]
        self.assertEqual(grp["conversation_is_group"], True)
        self.assertEqual(grp["conversation_title"], "Equipe")
        self.assertIn("u_a1", grp["conversation_participants_list"])
        self.assertIn("u_a2", grp["conversation_participants_list"])

    def test_edit_message_saves_content(self):
        """
        Regression: perform_update must call serializer.save() so the new
        content is actually written to the DB (not just edited_at).
        """
        msg = Message.objects.create(
            company=self.company_a, conversation=self.conv_a, sender=self.user_a1, content="Original content"
        )
        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/messages/{msg.id}/"
        response = self.client.patch(url, {"content": "Edited content"})

        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_204_NO_CONTENT])
        msg.refresh_from_db()
        self.assertEqual(msg.content, "Edited content", "Edited message content must be persisted")
        self.assertIsNotNone(msg.edited_at, "edited_at must be set after an edit")

    def test_soft_delete_message(self):
        """
        DELETE must mark the message as is_deleted=True and clear the content
        rather than removing the DB record (soft delete).
        """
        msg = Message.objects.create(
            company=self.company_a, conversation=self.conv_a, sender=self.user_a1, content="Delete me"
        )
        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/messages/{msg.id}/"
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Record must still exist in DB (soft delete)
        msg_db = Message.all_objects.get(pk=msg.pk)
        self.assertTrue(msg_db.is_deleted, "Message must be marked is_deleted=True after soft delete")
        self.assertIsNone(msg_db.content, "Message content must be cleared after soft delete")

        # Default manager must not return deleted messages
        self.assertFalse(
            Message.objects.filter(pk=msg.pk).exists(), "Soft-deleted messages must be hidden by the default manager"
        )

        log_exists = AuditLog.objects.filter(
            company=self.company_a,
            action="delete",
            resource="Message",
            resource_id=str(msg.id),
            details__conversation_id=self.conv_a.id,
            details__scope="everyone",
        ).exists()
        self.assertTrue(log_exists)

    def test_soft_delete_message_outside_window_denied(self):
        msg = Message.objects.create(
            company=self.company_a, conversation=self.conv_a, sender=self.user_a1, content="Too old"
        )
        Message.all_objects.filter(pk=msg.pk).update(created_at=timezone.now() - timedelta(hours=1))

        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/messages/{msg.id}/"
        response = self.client.delete(url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cannot_edit_other_users_message(self):
        msg = Message.objects.create(
            company=self.company_a, conversation=self.conv_a, sender=self.user_a2, content="Not yours"
        )
        self.auth(self.user_a1, "company-a")
        response = self.client.patch(f"/api/messenger/messages/{msg.id}/", {"content": "Hacked"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MessengerGroupCreationTest(MessengerBaseTest):
    """Tests for group conversation creation."""

    def test_group_creation_with_participants(self):
        """
        Regression: backend expects participant_usernames (strings), not IDs.
        The created group must contain all specified participants.
        """
        self.auth(self.user_a1, "company-a")
        response = self.client.post(
            "/api/messenger/conversations/",
            {"participant_usernames": ["u_a2"], "title": "Test Group", "is_group": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conv_id = response.data["id"]
        conv = Conversation.objects.get(pk=conv_id)

        participant_ids = list(conv.participants.values_list("id", flat=True))
        self.assertIn(self.user_a1.id, participant_ids, "Creator (u_a1) must be a participant of the created group")
        self.assertIn(
            self.user_a2.id, participant_ids, "u_a2 must be a participant since they were in participant_usernames"
        )


class MessengerPreferenceTest(MessengerBaseTest):
    """Tests for mute / pin preferences (backed by ConversationPreference)."""

    def test_mute_conversation(self):
        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/conversations/{self.conv_a.id}/mute/"
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("is_muted"))
        pref = ConversationPreference.objects.get(user=self.user_a1, conversation=self.conv_a)
        self.assertTrue(pref.is_muted)

    def test_unmute_conversation(self):
        ConversationPreference.objects.create(
            user=self.user_a1, conversation=self.conv_a, is_muted=True, company=self.company_a
        )
        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/conversations/{self.conv_a.id}/unmute/"
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data.get("is_muted"))
        pref = ConversationPreference.objects.get(user=self.user_a1, conversation=self.conv_a)
        self.assertFalse(pref.is_muted)

    def test_pin_conversation(self):
        self.auth(self.user_a1, "company-a")
        url = f"/api/messenger/conversations/{self.conv_a.id}/pin/"
        response = self.client.post(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data.get("is_pinned"))
        pref = ConversationPreference.objects.get(user=self.user_a1, conversation=self.conv_a)
        self.assertTrue(pref.is_pinned)

    def test_preferences_are_per_user(self):
        """Preferences must be isolated per user — muting for A1 does not mute for A2."""
        self.auth(self.user_a1, "company-a")
        self.client.post(f"/api/messenger/conversations/{self.conv_a.id}/mute/")

        # A2 should not have any preference record (not muted)
        self.assertFalse(
            ConversationPreference.objects.filter(user=self.user_a2, conversation=self.conv_a, is_muted=True).exists()
        )
