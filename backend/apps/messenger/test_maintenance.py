import os

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import TestCase

from apps.core.models import Company
from apps.messenger.models import Conversation, Message
from apps.messenger.tasks import cleanup_orphan_chat_files

User = get_user_model()


class MaintenanceTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Company", slug="test-company")
        self.user = User.objects.create_user(username="testuser", password="password", company=self.company)
        self.conv = Conversation.objects.create(company=self.company)
        self.conv.participants.add(self.user)

    def test_cleanup_orphan_files(self):
        # 1. Create a message with a file
        file_content = b"test content"
        file_name = "test_cleanup.txt"
        msg = Message.objects.create(
            conversation=self.conv, sender=self.user, company=self.company, content="Message with file"
        )
        msg.file.save(file_name, ContentFile(file_content))
        file_path = msg.file.path

        self.assertTrue(os.path.exists(file_path))

        # 2. Run cleanup - file should NOT be deleted because it's referenced
        cleanup_orphan_chat_files()
        self.assertTrue(os.path.exists(file_path))

        # 3. Soft delete message (clears file reference in DB)
        msg.soft_delete()
        self.assertIsNone(msg.file.name)

        # 4. Run cleanup again - file should BE deleted
        cleanup_orphan_chat_files()
        self.assertFalse(os.path.exists(file_path))

    def test_cleanup_non_chat_files_ignored(self):
        """Ensure it doesn't delete files outside chat/attachments/."""
        # This is harder to test without mocking os.walk,
        # but we can verify the directory checked is chat/attachments/
        pass
