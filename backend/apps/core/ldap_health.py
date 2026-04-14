"""
Health check específico para LDAP.
Verifica status de configurações LDAP ativas.
"""

import logging

from django.http import JsonResponse
from django.utils import timezone
from django.views import View

from apps.core.ldap_utils import test_ldap_connection
from apps.core.models import LDAPConfig

logger = logging.getLogger(__name__)


class LDAPHealthCheck(View):
    """
    Endpoint de health check para LDAP.
    Retorna status de todas as configurações ativas.
    """

    def get(self, request):
        """
        GET /api/core/ldap-health/

        Returns:
            {
                "status": "healthy" | "degraded" | "unhealthy",
                "total_configs": int,
                "active_configs": int,
                "failing_configs": int,
                "details": [...]
            }
        """
        try:
            all_configs = LDAPConfig.objects.select_related("company").all()
            active_configs = all_configs.filter(enabled=True)

            total = all_configs.count()
            active = active_configs.count()
            failing = 0

            details = []
            bind_sum = search_sum = group_sum = 0
            bind_count = search_count = group_count = 0
            tls_true = tls_false = 0

            for config in active_configs:
                result = test_ldap_connection(config, include_metrics=True)
                if isinstance(result, tuple) and len(result) == 3:
                    success, message, info = result
                else:
                    success, message = result
                    info = {}

                status_detail = {
                    "company": config.company.name,
                    "company_slug": config.company.slug,
                    "server_uri": config.server_uri,
                    "status": "up" if success else "down",
                    "last_test": config.last_test_at.isoformat() if config.last_test_at else None,
                }
                use_ssl = config.server_uri.startswith("ldaps://")
                status_detail["tls"] = (
                    "LDAPS" if use_ssl else ("StartTLS" if getattr(config, "use_tls", False) else "None")
                )
                if getattr(config, "require_group", None):
                    status_detail["require_group"] = config.require_group
                    status_detail["require_group_validated"] = bool(success)
                if info:
                    status_detail["tls"] = info.get("tls")
                    status_detail["tls_validated"] = info.get("tls_validated")
                    status_detail["metrics"] = {
                        "bind_ms": info.get("bind_ms"),
                        "search_ms": info.get("search_ms"),
                        "group_ms": info.get("group_ms"),
                    }
                    if info.get("bind_ms") is not None:
                        bind_sum += info.get("bind_ms") or 0
                        bind_count += 1
                    if info.get("search_ms") is not None:
                        search_sum += info.get("search_ms") or 0
                        search_count += 1
                    if info.get("group_ms") is not None:
                        group_sum += info.get("group_ms") or 0
                        group_count += 1
                    if info.get("tls_validated") is True:
                        tls_true += 1
                    elif info.get("tls_validated") is False:
                        tls_false += 1

                # Persistir mensagem com métricas quando disponíveis
                metrics_suffix = ""
                if info:
                    bind_ms = info.get("bind_ms")
                    search_ms = info.get("search_ms")
                    group_ms = info.get("group_ms")
                    tls = info.get("tls")
                    tls_val = info.get("tls_validated")
                    metrics_suffix = f" | tempos: bind={bind_ms}ms, search={search_ms}ms" + (
                        f", group={group_ms}ms" if group_ms is not None else ""
                    )
                    metrics_suffix += f" | TLS={tls}, validated={'sim' if tls_val else 'não'}"
                message_to_save = f"{message}{metrics_suffix}" if metrics_suffix else message

                if not success:
                    failing += 1
                    status_detail["error"] = message
                    config.last_test_status = "failed"
                    config.last_test_message = message_to_save
                else:
                    config.last_test_status = "success"
                    config.last_test_message = message_to_save
                config.last_test_at = timezone.now()
                config.save(update_fields=["last_test_status", "last_test_message", "last_test_at"])

                details.append(status_detail)

            # Determinar status geral
            if failing == 0:
                overall_status = "healthy"
            elif failing < active:
                overall_status = "degraded"
            else:
                overall_status = "unhealthy"

            response = {
                "status": overall_status,
                "total_configs": total,
                "active_configs": active,
                "failing_configs": failing,
                "details": details,
            }
            # Resumo de métricas (médias) quando disponível
            summary = {}
            if bind_count:
                summary["bind_ms_avg"] = round(bind_sum / bind_count)
            if search_count:
                summary["search_ms_avg"] = round(search_sum / search_count)
            if group_count:
                summary["group_ms_avg"] = round(group_sum / group_count)
            if tls_true or tls_false:
                summary["tls_validated"] = {"true": tls_true, "false": tls_false}
            if summary:
                response["metrics_summary"] = summary

            return JsonResponse(response)

        except Exception as e:
            logger.exception("Error in LDAP health check")
            return JsonResponse({"status": "error", "error": str(e)}, status=500)
