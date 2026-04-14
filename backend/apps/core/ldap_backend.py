"""
Backend de autenticação LDAP customizado para multi-tenancy.
Usa ldap3 (pura Python, cross-platform).
"""

import logging
import time

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.core.exceptions import LDAPBindError, LDAPException
from ldap3.utils.conv import escape_filter_chars

from apps.core.models import LDAPConfig

logger = logging.getLogger(__name__)
User = get_user_model()


class TenantLDAPBackend(ModelBackend):
    """
    Backend de autenticação LDAP que usa configurações por tenant.
    Fallback para autenticação padrão se LDAP não estiver configurado.
    """

    def authenticate(self, request, username=None, password=None, company=None, **kwargs):
        """
        Autentica usuário via LDAP se configurado para o tenant.
        """
        if not company or not username or not password:
            return None

        from django.core.cache import cache

        down_key = f"ldap_down:{company.slug}"
        if cache.get(down_key):
            logger.warning(f"LDAP is marked as DOWN for company {company.slug}. Skipping.")
            return None

        # Verificar se LDAP está habilitado para este tenant
        try:
            ldap_config = LDAPConfig.objects.select_related("company").get(company=company, enabled=True)
        except LDAPConfig.DoesNotExist:
            logger.debug(f"LDAP not configured/enabled for company: {company.slug}")
            return None

        # Tentar autenticação LDAP
        try:
            user_dn, user_attrs, is_admin_member = self._ldap_authenticate(ldap_config, username, password)

            if user_dn:
                # Autenticação LDAP bem-sucedida - criar/atualizar usuário
                user = self._get_or_create_user(company, username, user_attrs, ldap_config, is_admin_member)
                logger.info(f"✓ LDAP login successful: {username} @ {company.slug}")
                return user
            else:
                logger.warning(f"LDAP authentication failed for {username} @ {company.slug}")
                return None

        except (LDAPException, LDAPBindError) as e:
            # Erros de Bind (senha errada do usuário ou config errada do admin)
            if isinstance(e, LDAPBindError) and getattr(e, "result", {}).get("description") == "invalidCredentials":
                logger.warning(f"LDAP bind failed (invalid credentials) for {username} @ {company.slug}")
                return None

            # Erros específicos do LDAP (timeout, server down, configuração errada)
            logger.error(f"LDAP server issue for {company.slug}: {e!s}. Marking as DOWN.")
            cache.set(down_key, True, timeout=120)  # 2 minutos de "pausa"
            return None
        except Exception as e:
            logger.error(f"Unexpected LDAP error for {username} @ {company.slug}: {e!s}")
            return None

    def _ldap_authenticate(self, config: LDAPConfig, username: str, password: str):
        """
        Realiza autenticação LDAP usando ldap3.

        Returns:
            Tupla (user_dn, user_attrs) ou (None, None) se falhar
        """
        try:
            use_ssl = config.server_uri.startswith("ldaps://")
            server = Server(config.server_uri, get_info=ALL, use_ssl=use_ssl, connect_timeout=5)
            bind_password = config.get_bind_password()
            retries = 1
            delay = 0.2
            for attempt in range(retries + 1):
                try:
                    start_tls = (not use_ssl) and getattr(config, "use_tls", False)
                    admin_conn = Connection(server, user=config.bind_dn, password=bind_password, auto_bind=False)
                    if start_tls:
                        admin_conn.open()
                        admin_conn.start_tls()
                    admin_conn.bind()
                    break
                except (LDAPException, LDAPBindError):
                    if attempt < retries:
                        time.sleep(delay * (attempt + 1))
                        continue
                    raise
            try:
                escaped_user = escape_filter_chars(username)
                search_filter = config.user_search_filter.replace("%(user)s", escaped_user)
                logger.debug(f"Searching for user with filter: {search_filter}")
                for attempt in range(retries + 1):
                    try:
                        admin_conn.search(
                            search_base=config.user_search_base,
                            search_filter=search_filter,
                            search_scope=SUBTREE,
                            attributes=[
                                config.attr_username,
                                config.attr_email,
                                config.attr_first_name,
                                config.attr_last_name,
                            ],
                        )
                        break
                    except LDAPException:
                        if attempt < retries:
                            time.sleep(delay * (attempt + 1))
                            continue
                        raise
                if not admin_conn.entries:
                    logger.warning(f"User {username} not found in LDAP")
                    return None, None, False
                entry = admin_conn.entries[0]
                user_dn = entry.entry_dn
                logger.debug(f"Found user DN: {user_dn}")
                is_admin_member = False
                if config.require_group:
                    if not self._check_group_membership(admin_conn, user_dn, config.require_group):
                        logger.warning(f"User {username} not in required group {config.require_group}")
                        return None, None, False
                if getattr(config, "admin_group_dn", ""):
                    is_admin_member = self._check_group_membership(admin_conn, user_dn, config.admin_group_dn)
            finally:
                try:
                    admin_conn.unbind()
                except Exception:
                    pass
            for attempt in range(retries + 1):
                try:
                    start_tls = (not use_ssl) and getattr(config, "use_tls", False)
                    user_conn = Connection(server, user=user_dn, password=password, auto_bind=False)
                    if start_tls:
                        user_conn.open()
                        user_conn.start_tls()
                    user_conn.bind()
                    break
                except (LDAPException, LDAPBindError):
                    if attempt < retries:
                        time.sleep(delay * (attempt + 1))
                        continue
                    raise
            try:
                pass
            finally:
                try:
                    user_conn.unbind()
                except Exception:
                    pass
            user_attrs = {
                config.attr_username: _first_or_str(getattr(entry, config.attr_username, username), default=username),
                config.attr_email: _first_or_str(getattr(entry, config.attr_email, ""), default=""),
                config.attr_first_name: _first_or_str(getattr(entry, config.attr_first_name, ""), default=""),
                config.attr_last_name: _first_or_str(getattr(entry, config.attr_last_name, ""), default=""),
            }
            return user_dn, user_attrs, is_admin_member
        except LDAPBindError:
            logger.warning(f"Invalid password for user {username}")
            return None, None, False
        except LDAPException as e:
            logger.error(f"LDAP error during authentication: {e!s}")
            return None, None, False
        except Exception as e:
            logger.exception(f"Unexpected error during LDAP authentication: {e!s}")
            return None, None, False

    def _check_group_membership(self, conn: Connection, user_dn: str, group_dn: str) -> bool:
        try:
            conn.search(
                search_base=group_dn, search_filter=f"(member={escape_filter_chars(user_dn)})", search_scope=SUBTREE
            )
            return len(conn.entries) > 0
        except LDAPException as e:
            logger.error(f"Error checking group membership: {e!s}")
            return False

    def _get_or_create_user(
        self, company, username: str, user_attrs: dict, config: LDAPConfig, is_admin_member: bool = False
    ):
        email = user_attrs.get(config.attr_email, f"{username}@{company.slug}.local")
        first_name = user_attrs.get(config.attr_first_name, "")
        last_name = user_attrs.get(config.attr_last_name, "")
        user, created = User.all_objects.get_or_create(
            username=username,
            company=company,
            defaults={
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "is_active": True,
                "is_staff": bool(is_admin_member),
            },
        )
        if not created:
            user.email = email
            user.first_name = first_name
            user.last_name = last_name

            update_fields = ["email", "first_name", "last_name"]

            if is_admin_member and not user.is_staff:
                user.is_staff = True
                update_fields.append("is_staff")
            elif not is_admin_member and user.is_staff and not user.is_superuser:
                user.is_staff = False
                update_fields.append("is_staff")

            user.save(update_fields=update_fields)
        logger.info(f"{'Created' if created else 'Updated'} user from LDAP: {username}")
        return user


def _first_or_str(value, default=""):
    try:
        if value is None:
            return default
        if hasattr(value, "values"):
            vals = list(getattr(value, "values", []))
            if vals:
                return str(vals[0])
            return default
        if isinstance(value, (list, tuple)) and value:
            return str(value[0])
        return str(value)
    except Exception:
        return default
