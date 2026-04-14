from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.core.models import AuditLog, Company

User = get_user_model()


class AccountSignalsTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")

    @patch("apps.accounts.tasks.send_welcome_email.delay")
    def test_user_creation_triggers_audit_and_email(self, mock_task):
        user = User.objects.create_user(
            username="newuser",
            email="new@test.com",
            password="pwd",
            company=self.company,
        )

        log = AuditLog.all_objects.filter(resource="User", resource_id=str(user.id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, "create")
        self.assertEqual(log.company, self.company)

        with self.captureOnCommitCallbacks(execute=True):
            User.objects.create_user(
                username="commit_user",
                email="c@test.com",
                password="pwd",
                company=self.company,
            )

        self.assertTrue(mock_task.called)
