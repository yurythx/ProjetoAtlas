"""
Utilitários para testar conexão LDAP.
Usa ldap3 (pura Python, cross-platform).
"""

import logging
import time

from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.core.exceptions import LDAPBindError, LDAPException

logger = logging.getLogger(__name__)


def test_ldap_connection(config, include_metrics: bool = False):
    """
    Testa conexão LDAP com a configuração fornecida.

    Args:
        config: Instância de LDAPConfig

    Returns:
        Tupla (success: bool, message: str)
    """

    # Validação de campos obrigatórios
    if not config.server_uri:
        return False, "❌ Server URI não configurado. Configure o endereço do servidor LDAP."

    if not config.bind_dn:
        return False, "❌ Bind DN não configurado. Configure o DN de autenticação administrativa."

    if not config.user_search_base:
        return False, "❌ User Search Base não configurado. Configure a base DN para busca de usuários."

    bind_password = config.get_bind_password()
    if not bind_password:
        return False, "❌ Bind Password não configurado. Configure a senha do Bind DN."

    try:
        use_ssl = config.server_uri.startswith("ldaps://")
        tls_validated = False
        server = Server(config.server_uri, get_info=ALL, use_ssl=use_ssl, connect_timeout=10)
        logger.info(f"Testing LDAP connection to {config.server_uri}")
        try:
            start_tls = (not use_ssl) and getattr(config, "use_tls", False)
            conn = Connection(server, user=config.bind_dn, password=bind_password, auto_bind=False)
            t0 = time.perf_counter()
            if start_tls:
                conn.open()
                tls_validated = bool(conn.start_tls())
            elif use_ssl:
                tls_validated = True
            conn.bind()
            bind_ms = int((time.perf_counter() - t0) * 1000)
        except LDAPBindError:
            return False, (
                "❌ Credenciais do Bind DN inválidas.\n\n"
                "Verifique:\n"
                f"- Bind DN: {config.bind_dn}\n"
                "- Senha está correta\n"
                "- DN tem permissão de busca no diretório"
            )
        except Exception as e:
            return False, f"❌ Erro ao conectar ao servidor:\n{e!s}"

        # Testar busca na base de usuários
        try:
            retries = 2
            delay = 0.3
            t1 = time.perf_counter()
            for attempt in range(retries + 1):
                try:
                    conn.search(
                        search_base=config.user_search_base,
                        search_filter="(objectClass=*)",
                        search_scope=SUBTREE,
                        size_limit=1,
                    )
                    break
                except LDAPException:
                    if attempt < retries:
                        time.sleep(delay * (attempt + 1))
                        continue
                    raise
            search_ms = int((time.perf_counter() - t1) * 1000)
        except LDAPException as e:
            return False, (
                f"❌ Erro ao buscar em '{config.user_search_base}':\n\n"
                f"{e!s}\n\n"
                "Verifique se o User Search Base está correto."
            )

        # Verificar filtro de busca
        if "%(user)s" not in config.user_search_filter:
            return False, (
                "❌ Filtro de busca inválido.\n\n"
                "O filtro deve conter '%(user)s' como placeholder para o username.\n"
                f"Filtro atual: {config.user_search_filter}\n\n"
                "Exemplos válidos:\n"
                "- (uid=%(user)s)\n"
                "- (sAMAccountName=%(user)s)"
            )

        # Testar grupo obrigatório se configurado
        if config.require_group:
            try:
                t2 = time.perf_counter()
                conn.search(
                    search_base=config.require_group,
                    search_filter="(objectClass=*)",
                    search_scope=SUBTREE,
                    size_limit=1,
                )
                group_ms = int((time.perf_counter() - t2) * 1000)
            except LDAPException as e:
                return False, (
                    f"❌ Grupo obrigatório não encontrado:\n\n"
                    f"DN: {config.require_group}\n"
                    f"Erro: {e!s}\n\n"
                    "Verifique se o DN do grupo está correto."
                )

        # Testar existência do grupo admin se configurado
        if getattr(config, "admin_group_dn", ""):
            try:
                conn.search(
                    search_base=config.admin_group_dn,
                    search_filter="(objectClass=*)",
                    search_scope=SUBTREE,
                    size_limit=1,
                )
            except LDAPException as e:
                return False, (
                    f"❌ Grupo administrativo não encontrado:\n\n"
                    f"DN: {config.admin_group_dn}\n"
                    f"Erro: {e!s}\n\n"
                    "Verifique se o DN do grupo está correto."
                )

        try:
            conn.unbind()
        except Exception:
            pass
        tls_status = "LDAPS" if use_ssl else ("StartTLS" if getattr(config, "use_tls", False) else "None")

        success_msg = (
            "✅ Conexão LDAP estabelecida com sucesso!\n\n"
            f"Servidor: {config.server_uri}\n"
            f"Base de Busca: {config.user_search_base}\n"
            f"Filtro: {config.user_search_filter}\n"
            f"TLS/SSL: {tls_status}"
        )

        if config.require_group:
            success_msg += "\nGrupo Obrigatório: ✓ Validado"

        if include_metrics:
            info = {
                "tls": tls_status,
                "bind_ms": bind_ms,
                "search_ms": search_ms,
            }
            if config.require_group:
                info["group_ms"] = group_ms
            info["tls_validated"] = tls_validated
            return True, success_msg, info
        else:
            return True, success_msg

    except LDAPException as e:
        error_msg = str(e).lower()

        if "server down" in error_msg or "cannot connect" in error_msg:
            return False, (
                f"❌ Servidor LDAP não acessível.\n\n"
                f"URI: {config.server_uri}\n\n"
                "Verifique:\n"
                "- O servidor está ligado e acessível\n"
                "- Firewall permite conexão\n"
                "- Porta correta (389 para LDAP, 636 para LDAPS)"
            )
        elif "invalid credentials" in error_msg:
            return False, ("❌ Credenciais do Bind DN inválidas.\n\nVerifique o DN e a senha.")
        else:
            return False, f"❌ Erro LDAP: {e!s}"

    except Exception as e:
        logger.exception("Unexpected error testing LDAP connection")
        return False, f"❌ Erro inesperado: {e!s}"
