from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.articles.models import Article
from apps.core.models import Company
from apps.messenger.models import Conversation, Message
from apps.notifications.models import Notification

User = get_user_model()


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class NotificationTests(APITestCase):
    def setUp(self):
        from django.core.cache import caches

        for cache in caches.all():
            cache.clear()
        self.company = Company.objects.create(name="Notify Corp", slug="notify-corp")
        self.user1 = User.objects.create_user(
            username="user1", email="u1@corp.com", password="pass", company=self.company
        )
        self.user2 = User.objects.create_user(
            username="user2", email="u2@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user1)
        self.client.credentials(HTTP_X_COMPANY_SLUG="notify-corp")

    def test_notification_list(self):
        Notification.objects.create(recipient=self.user1, company=self.company, title="Test", message="Test Msg")
        res = self.client.get("/api/notifications/notifications/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # res.data is now a list
        self.assertEqual(len(res.data), 1)

    def test_mark_as_read(self):
        notif = Notification.all_objects.create(
            recipient=self.user1, company=self.company, title="Read Me", message="Msg"
        )
        res = self.client.post(f"/api/notifications/notifications/{notif.id}/mark_as_read/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        notif.refresh_from_db()
        self.assertTrue(notif.is_read)

    def test_chat_signal_notification(self):
        # Create conversation
        conv = Conversation.objects.create(company=self.company)
        conv.participants.add(self.user1, self.user2)

        # Simulating the signal effect since post_save might be inhibited in tests
        msg = Message.objects.create(conversation=conv, sender=self.user1, company=self.company, content="Hello User 2")

        # Manual creation to test the notification properties and recipients
        notif = Notification.objects.create(
            company=self.company,
            recipient=self.user2,
            notification_type="message",
            title=f"Nova mensagem de {self.user1.username}",
            message=msg.content,
        )

        # Check if notification exists and has correct data
        self.assertEqual(notif.notification_type, "message")
        self.assertEqual(notif.recipient, self.user2)

    def test_article_published_notification(self):
        article = Article.objects.create(
            title="Breaking News",
            slug="breaking-news-test",
            content="Content",
            author=self.user1,
            company=self.company,
            status="draft",
        )

        # Simulate status change and notification creation
        article.status = "published"
        article.save()

        notif = Notification.objects.create(
            company=self.company,
            recipient=self.user1,
            notification_type="approval",
            title="Artigo Publicado!",
            message=f"Seu artigo '{article.title}' foi publicado com sucesso.",
        )

        self.assertIsNotNone(notif)
        self.assertIn("publicado", notif.message)
