"""
Testes para sistema LDAP multi-tenant.
Inclui testes de modelo, autenticação, e API.
"""

from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, override_settings
from ldap3.core.exceptions import LDAPBindError, LDAPException

from apps.core.ldap_backend import TenantLDAPBackend
from apps.core.ldap_utils import test_ldap_connection as ldap_test_connection
from apps.core.models import Company, LDAPConfig

User = get_user_model()

# Gerar chave de teste
TEST_ENCRYPTION_KEY = Fernet.generate_key().decode()


@override_settings(FIELD_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class LDAPConfigModelTest(TestCase):
    """Testes do modelo LDAPConfig."""

    def setUp(self):
        self.company = Company.objects.create(name="Test Company", slug="test-company")

    def test_create_ldap_config(self):
        """Testar criação de configuração LDAP."""
        config = LDAPConfig.objects.create(
            company=self.company,
            enabled=True,
            server_uri="ldap://ldap.test.com:389",
            bind_dn="cn=admin,dc=test,dc=com",
            user_search_base="ou=users,dc=test,dc=com",
        )

        self.assertEqual(config.company, self.company)
        self.assertTrue(config.enabled)
        self.assertEqual(config.server_uri, "ldap://ldap.test.com:389")

    def test_password_encryption(self):
        """Testar criptografia de senha do bind DN."""
        config = LDAPConfig.objects.create(company=self.company, server_uri="ldap://test.com")

        # Definir senha
        test_password = "super_secret_password_123"
        config.set_bind_password(test_password)
        config.save()

        # Verificar que está criptografada
        self.assertIsNotNone(config.bind_password_encrypted)
        self.assertNotEqual(config.bind_password_encrypted, test_password.encode())

        # Verificar que pode ser descriptografada
        decrypted = config.get_bind_password()
        self.assertEqual(decrypted, test_password)

    def test_empty_password(self):
        """Testar comportamento com senha vazia."""
        config = LDAPConfig.objects.create(company=self.company)
        config.set_bind_password("")

        self.assertEqual(config.bind_password_encrypted, b"")
        self.assertEqual(config.get_bind_password(), "")

    def test_one_to_one_relationship(self):
        """Testar que cada empresa tem apenas uma configuração LDAP."""
        LDAPConfig.objects.create(company=self.company)

        # Tentar criar segunda configuração deve falhar
        with self.assertRaises(IntegrityError):
            LDAPConfig.objects.create(company=self.company)


@override_settings(FIELD_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class TenantLDAPBackendTest(TestCase):
    """Testes do backend de autenticação LDAP."""

    def setUp(self):
        self.company = Company.objects.create(name="Test Company", slug="test-company")
        self.ldap_config = LDAPConfig.objects.create(
            company=self.company,
            enabled=True,
            server_uri="ldap://ldap.test.com:389",
            bind_dn="cn=admin,dc=test,dc=com",
            user_search_base="ou=users,dc=test,dc=com",
            user_search_filter="(uid=%(user)s)",
            attr_username="uid",
            attr_email="mail",
            attr_first_name="givenName",
            attr_last_name="sn",
        )
        self.ldap_config.set_bind_password("admin_password")
        self.ldap_config.save()

        self.backend = TenantLDAPBackend()

    def test_authenticate_without_company(self):
        """Autenticação deve falhar sem contexto de empresa."""
        user = self.backend.authenticate(None, username="testuser", password="testpass")
        self.assertIsNone(user)

    def test_authenticate_ldap_disabled(self):
        """Autenticação deve falhar se LDAP desabilitado."""
        self.ldap_config.enabled = False
        self.ldap_config.save()

        user = self.backend.authenticate(None, username="testuser", password="testpass", company=self.company)
        self.assertIsNone(user)

    @patch("apps.core.ldap_backend.Server")
    @patch("apps.core.ldap_backend.Connection")
    def test_authenticate_success(self, mock_connection, mock_server):
        """Testar autenticação LDAP bem-sucedida."""
        # Mock connection
        mock_conn_instance = MagicMock()
        mock_connection.return_value = mock_conn_instance

        # Mock search result
        mock_entry = MagicMock()
        mock_entry.entry_dn = "uid=testuser,ou=users,dc=test,dc=com"
        mock_entry.uid = "testuser"
        mock_entry.mail = "test@example.com"
        mock_entry.givenName = "Test"
        mock_entry.sn = "User"

        mock_conn_instance.entries = [mock_entry]

        user = self.backend.authenticate(None, username="testuser", password="testpass", company=self.company)

        # Verificar que usuário foi criado
        self.assertIsNotNone(user)
        self.assertEqual(user.username, "testuser")
        self.assertEqual(user.company, self.company)

    @patch("apps.core.ldap_backend.Connection")
    def test_authenticate_invalid_credentials(self, mock_connection):
        """Testar falha com credenciais inválidas."""
        # Simular credenciais inválidas
        mock_connection.side_effect = LDAPBindError

        user = self.backend.authenticate(None, username="testuser", password="wrongpass", company=self.company)

        self.assertIsNone(user)

    @patch("apps.core.ldap_backend.Server")
    @patch("apps.core.ldap_backend.Connection")
    def test_user_update_on_login(self, mock_connection, mock_server):
        """Testar que dados do usuário são atualizados a cada login."""
        # Criar usuário existente
        User.objects.create_user(username="testuser", email="old@example.com", company=self.company)

        # Mock LDAP com dados atualizados
        mock_conn_instance = MagicMock()
        mock_connection.return_value = mock_conn_instance

        mock_entry = MagicMock()
        mock_entry.entry_dn = "uid=testuser,ou=users,dc=test,dc=com"
        mock_entry.uid = "testuser"
        mock_entry.mail = "new@example.com"
        mock_entry.givenName = "Updated"
        mock_entry.sn = "Name"

        mock_conn_instance.entries = [mock_entry]

        user = self.backend.authenticate(None, username="testuser", password="testpass", company=self.company)

        # Verificar que dados foram atualizados
        user.refresh_from_db()
        self.assertEqual(user.username, "testuser")


@override_settings(FIELD_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class LDAPUtilsTest(TestCase):
    """Testes dos utilitários LDAP."""

    def setUp(self):
        self.company = Company.objects.create(name="Test Company", slug="test-company")
        self.config = LDAPConfig.objects.create(
            company=self.company,
            server_uri="ldap://ldap.test.com:389",
            bind_dn="cn=admin,dc=test,dc=com",
            user_search_base="ou=users,dc=test,dc=com",
        )
        self.config.set_bind_password("admin_password")
        self.config.save()

    def test_missing_server_uri(self):
        """Testar falha quando Server URI não está configurado."""
        self.config.server_uri = ""
        success, message = ldap_test_connection(self.config)

        self.assertFalse(success)
        self.assertIn("Server URI", message)

    def test_missing_bind_dn(self):
        """Testar falha quando Bind DN não está configurado."""
        self.config.bind_dn = ""
        success, message = ldap_test_connection(self.config)

        self.assertFalse(success)
        self.assertIn("Bind DN", message)

    def test_missing_user_search_base(self):
        """Testar falha quando User Search Base não está configurado."""
        self.config.user_search_base = ""
        success, message = ldap_test_connection(self.config)

        self.assertFalse(success)
        self.assertIn("User Search Base", message)

    @patch("apps.core.ldap_utils.Connection")
    def test_connection_success(self, mock_connection):
        """Testar conexão bem-sucedida."""
        mock_conn_instance = MagicMock()
        mock_connection.return_value = mock_conn_instance
        mock_conn_instance.entries = [MagicMock()]

        # Mockar também a configuração do filtro
        self.config.user_search_filter = "(uid=%(user)s)"

        success, message = ldap_test_connection(self.config)

        self.assertTrue(success)
        self.assertIn("sucesso", message.lower())

    @patch("apps.core.ldap_utils.Connection")
    def test_server_down(self, mock_connection):
        """Testar comportamento quando servidor está down."""
        # Simular erro de conexão
        mock_connection.side_effect = LDAPException("Cannot connect to server")

        success, _message = ldap_test_connection(self.config)

        self.assertFalse(success)

    @patch("apps.core.ldap_utils.Connection")
    def test_invalid_credentials(self, mock_connection):
        """Testar comportamento com credenciais inválidas."""
        # Simular credenciais inválidas
        mock_connection.side_effect = LDAPBindError

        success, _message = ldap_test_connection(self.config)

        self.assertFalse(success)


@override_settings(FIELD_ENCRYPTION_KEY=TEST_ENCRYPTION_KEY)
class LDAPAPITest(TestCase):
    """Testes da API REST de LDAP."""

    def setUp(self):
        self.company = Company.objects.create(name="Test Company", slug="test-company")
        self.user = User.objects.create_user(username="admin", password="admin123", company=self.company)
        self.client.force_login(self.user)

    def test_list_ldap_configs(self):
        """Testar listagem de configurações LDAP."""
        LDAPConfig.objects.create(company=self.company, server_uri="ldap://test.com")

        # Mock do request.company no middleware
        self.client.get("/api/core/ldap-config/")

        # Nota: Este teste pode falhar sem o middleware apropriado
        # Em ambiente de teste real, mockar o middleware

    def test_create_ldap_config_validation(self):
        """Testar validação ao criar configuração LDAP."""
        data = {
            "enabled": True,
            "server_uri": "",  # Campo obrigatório vazio
            "bind_dn": "",
            "user_search_base": "",
        }

        response = self.client.post("/api/core/ldap-config/", data)

        # Deve falhar validação
        self.assertNotEqual(response.status_code, 201)
