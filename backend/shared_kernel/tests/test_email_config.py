from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.core.models import Company, TenantEmailConfig
from shared_kernel.email import send_email_task


class EmailRoutingTest(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Mail Corp", slug="mail-corp")

    @patch("shared_kernel.email.EmailMultiAlternatives")
    def test_default_email_backend(self, mock_email):
        """Testa envio usando backend padrão quando não há config customizada."""
        send_email_task(
            subject="Test",
            recipient_list=["test@example.com"],
            template_name="emails/notification.html",
            context={"message": "Hello"},
            company_id=str(self.company.id),
        )
        # Deve ter sido chamado sem conexão customizada (None)
        mock_email.assert_called()
        _args, kwargs = mock_email.call_args
        self.assertIsNone(kwargs.get("connection"))

    @patch("shared_kernel.email.get_connection")
    @patch("shared_kernel.email.EmailMultiAlternatives")
    def test_custom_tenant_email_backend(self, mock_email, mock_get_connection):
        """Testa envio usando configuração SMTP do inquilino."""
        config = TenantEmailConfig.objects.create(
            company=self.company,
            use_custom_smtp=True,
            smtp_host="smtp.tenant.com",
            smtp_port=587,
            smtp_use_tls=True,
            smtp_user="user@tenant.com",
            from_email="noreply@tenant.com",
        )
        from cryptography.fernet import Fernet

        with override_settings(FIELD_ENCRYPTION_KEY=Fernet.generate_key().decode()):
            config.set_smtp_password("password")
            config.save(update_fields=["smtp_password_encrypted"])

            send_email_task(
                subject="Test Custom",
                recipient_list=["test@example.com"],
                template_name="emails/notification.html",
                context={"message": "Hello Custom"},
                company_id=str(self.company.id),
            )

            # get_connection deve ter sido chamado
            mock_get_connection.assert_called_with(
                host="smtp.tenant.com", port=587, username="user@tenant.com", password="password", use_tls=True
            )

            # O resultado de get_connection deve ter sido passado para o EmailMultiAlternatives
            mock_email.assert_called()
            _args, kwargs = mock_email.call_args
            self.assertEqual(kwargs.get("connection"), mock_get_connection.return_value)
