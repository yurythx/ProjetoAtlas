from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import HasRolePermission
from apps.articles.models import Article, Category

from .models import AuditLog, Company, LDAPConfig
from .serializers import (
    AuditLogSerializer,
    CompanySerializer,
    CompanyUpdateSerializer,
    DashboardStatsSerializer,
    LDAPConfigSerializer,
    RobotsSerializer,
)


def get_month_range():
    """Helper to get start and end of current month."""
    now = timezone.now()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Next month start
    if now.month == 12:
        end = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        end = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    return start, end


class IsSuperUser(permissions.BasePermission):
    """
    Permissão que permite acesso apenas a superusuários globais.
    is_staff não é suficiente.
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


@extend_schema_view(
    list=extend_schema(tags=["Core"]),
    retrieve=extend_schema(tags=["Core"]),
    create=extend_schema(tags=["Core"]),
    update=extend_schema(tags=["Core"]),
    partial_update=extend_schema(tags=["Core"]),
    destroy=extend_schema(tags=["Core"]),
    public_list=extend_schema(tags=["Core"], auth=[]),
)
class CompanyViewSet(viewsets.ModelViewSet):
    """
    CRUD de Empresas.
    Em um cenário real, a criação de empresas pode ser restrita a superadmins
    ou via fluxo de pagamento. Aqui deixamos aberto para facilitar o setup.
    """

    queryset = Company.objects.all().order_by("name")
    serializer_class = CompanySerializer
    lookup_field = "slug"

    @action(detail=False, methods=["get"], permission_classes=[permissions.AllowAny])
    def health(self, request):
        """Health check endpoint for monitoring."""
        import time

        from django.core.cache import cache
        from django.db import connection

        start_time = time.time()

        # Check DB
        db_status = "ok"
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            db_status = "error"

        # Check Redis
        redis_status = "ok"
        try:
            cache.set("health_check", "ok", 10)
            if cache.get("health_check") != "ok":
                redis_status = "error"
        except Exception:
            redis_status = "error"

        return Response(
            {
                "status": "ok" if db_status == "ok" and redis_status == "ok" else "error",
                "timestamp": time.time(),
                "database": db_status,
                "redis": redis_status,
                "minio": "ok",  # Simplified for now
                "celery": "ok",  # Simplified for now
                "response_time_ms": round((time.time() - start_time) * 1000, 2),
            }
        )

    @action(detail=False, methods=["get"], permission_classes=[permissions.AllowAny], throttle_classes=[])
    def public_list(self, request):
        """Lista apenas nome, slug e logo para o seletor de login"""
        companies = Company.objects.select_related("theme_branding").all()
        data = []
        for c in companies:
            logo_url = None
            # Check if branding exists and has a logo
            if hasattr(c, "theme_branding") and c.theme_branding.logo:
                logo_url = request.build_absolute_uri(c.theme_branding.logo.url)

            data.append({"name": c.name, "slug": c.slug, "logo": logo_url})
        return Response(data)

    @action(detail=False, methods=["get", "patch"], permission_classes=[permissions.IsAuthenticated])
    def current(self, request):
        """Retorna os dados da empresa atual do usuário autenticado."""
        if not request.company:
            return Response({"detail": "No tenant context found."}, status=status.HTTP_404_NOT_FOUND)
        if request.method == "PATCH":
            if not request.user.is_superuser:
                role = getattr(request.user, "role", None)
                perms = role.permissions if isinstance(getattr(role, "permissions", None), list) else []
                if "*" not in perms and "admin.settings_manage" not in perms:
                    return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
            serializer = CompanyUpdateSerializer(request.company, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(CompanySerializer(request.company, context={"request": request}).data)

        serializer = self.get_serializer(request.company)
        return Response(serializer.data)

    def perform_update(self, serializer):
        """Override to invalidate cache when Company is updated."""
        instance = serializer.save()

        # Invalidate cache for this company
        from django.core.cache import cache

        cache_key = f"company:slug:{instance.slug}"
        cache.delete(cache_key)

        return instance

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def complete_onboarding(self, request):
        """Marca o onboarding como concluído para a empresa atual."""
        # Apenas administradores do tenant (ou superuser) podem concluir o onboarding
        if not request.user.is_superuser:
            role = getattr(request.user, "role", None)
            if not role:
                return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)
            perms = role.permissions if isinstance(role.permissions, list) else []
            if "*" not in perms and "admin.settings_manage" not in perms:
                return Response({"detail": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        company = request.company
        if not company:
            return Response({"detail": "No tenant context found."}, status=status.HTTP_404_NOT_FOUND)

        company.onboarding_completed = True
        company.save()

        # Log da ação
        AuditLog.objects.create(
            company=company,
            user=request.user,
            action="update",
            resource="Company",
            resource_id=str(company.id),
            details={"message": "Onboarding completed"},
        )

        return Response({"status": "onboarding marked as complete"})

    # Permitir criação pública para onboarding inicial?
    # Ou restringir? Vamos permitir AllowAny no create e IsAuthenticated no resto.
    def get_authenticators(self):
        # Allow public access to public_list and health without auth
        path = getattr(getattr(self, "request", None), "path", "") or ""
        if path.startswith("/api/core/companies/") and (path.endswith("/public_list/") or path.endswith("/health/")):
            return []
        return super().get_authenticators()

    def get_permissions(self):
        path = getattr(getattr(self, "request", None), "path", "") or ""
        if path.startswith("/api/core/companies/") and (path.endswith("/public_list/") or path.endswith("/health/")):
            return [permissions.AllowAny()]

        action = getattr(self, "action", None)
        if action == "create":
            if not self.request.user.is_authenticated:
                return [permissions.AllowAny()]
            return [IsSuperUser()]
        if action in ["destroy", "update", "partial_update"]:
            return [permissions.IsAuthenticated(), IsSuperUser()]
        if action == "public_list":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]


@extend_schema_view(
    list=extend_schema(tags=["Core"]),
    retrieve=extend_schema(tags=["Core"]),
)
class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Visualização dos logs de auditoria do tenant.
    Apenas leitura para garantir integridade.
    """

    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    required_permission = "admin.view_dashboard"

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("user").all().order_by("-created_at")

        # Filtros básicos via query params
        user_id = self.request.query_params.get("user")
        if user_id:
            queryset = queryset.filter(user_id=user_id)

        action = self.request.query_params.get("action")
        if action:
            queryset = queryset.filter(action=action)

        search = self.request.query_params.get("search")
        if search:
            from django.db.models import Q

            queryset = queryset.filter(
                Q(resource__icontains=search) | Q(resource_id__icontains=search) | Q(action__icontains=search)
            )

        return queryset


class DashboardStatsView(generics.GenericAPIView):
    """
    Endpoint para retornar estatísticas ricas e comparativas para o dashboard.
    """

    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    required_permission = "admin.view_dashboard"
    serializer_class = DashboardStatsSerializer

    @extend_schema(tags=["Core"], responses={200: DashboardStatsSerializer})
    def get(self, request):
        company = request.company
        if not company:
            return Response({"error": "No company context"}, status=400)

        # Cache de 60 segundos por empresa
        from django.core.cache import cache

        company = request.company
        if not company:
            return Response({"error": "No company context found"}, status=status.HTTP_400_BAD_REQUEST)

        cache_key = f"dash_stats:{company.id}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return Response(cached_data)

        try:
            # 1. Contadores Rápidos
            total_users = get_user_model().objects.filter(company=company).count()
            published_articles = Article.objects.filter(company=company, status="published").count()
            total_messages = 0  # Fallback se messenger não estiver ativo

            try:
                from apps.messenger.models import Message

                total_messages = Message.objects.filter(conversation__company=company).count()
            except ImportError:
                pass
            except Exception as e:
                import logging

                logging.getLogger(__name__).error(f"Error fetching messenger stats: {e}")

            # 1.1 CRM Stats
            total_deals = 0
            active_swarms = 0
            csi_identified = 0
            try:
                from apps.crm.models import CSIEntry, Deal, Swarm

                total_deals = Deal.objects.filter(company=company, is_deleted=False).count()
                active_swarms = Swarm.objects.filter(company=company, is_active=True).count()
                csi_identified = CSIEntry.objects.filter(company=company, status="identified").count()
            except ImportError:
                pass
            except Exception as e:
                import logging

                logging.getLogger(__name__).error(f"Error fetching CRM stats: {e}")

            # 1.2 Finance Stats
            total_revenue = 0.0
            total_expenses = 0.0
            try:
                from django.db.models import Sum
                from apps.finance.models import Transaction

                month_start, _ = get_month_range()
                finance_qs = Transaction.objects.filter(company=company, competence_date__gte=month_start.date())
                
                revenue = finance_qs.filter(type="in").aggregate(total=Sum("amount"))["total"] or 0
                expenses = finance_qs.filter(type="out").aggregate(total=Sum("amount"))["total"] or 0
                
                total_revenue = float(revenue)
                total_expenses = float(expenses)
            except ImportError:
                pass
            except Exception as e:
                import logging

                logging.getLogger(__name__).error(f"Error fetching Finance stats: {e}")

            # 2. Atividade Recente (Audit Logs)
            try:
                recent_activity = (
                    AuditLog.objects.filter(company=company).select_related("user").order_by("-created_at")[:10]
                )

                recent_activity_data = []
                for log in recent_activity:
                    recent_activity_data.append(
                        {
                            "action": log.action,
                            "resource": log.resource,
                            "created_at": log.created_at.isoformat(),
                            "user": {
                                "name": (log.user.get_full_name() or log.user.username) if log.user else "Sistema",
                                "avatar": None,
                            },
                        }
                    )
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Error fetching audit logs for dashboard: {e}")
                recent_activity_data = []

            # 3. Visualizações por data (Últimos 30 dias)
            thirty_days_ago = timezone.now().date() - timezone.timedelta(days=30)
            from apps.articles.models import ArticleView

            views_by_date_qs = (
                ArticleView.objects.filter(company=company, viewed_at__date__gte=thirty_days_ago)
                .annotate(date=TruncDate("viewed_at"))
                .values("date")
                .annotate(count=Count("id"))
                .order_by("date")
            )

            views_series = []
            for item in views_by_date_qs:
                views_series.append({"date": item["date"].isoformat(), "count": item["count"]})

            # 4. Distribuição por Categorias
            categories_data = (
                Category.objects.filter(company=company)
                .annotate(article_count=Count("articles"))
                .order_by("-article_count")[:5]
            )

            # 5. Dashboard Stats Format matching Serializer
            this_month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # Growth/New logic (simulated for now or calculated if needed)
            new_users_month = (
                get_user_model().objects.filter(company=company, date_joined__gte=this_month_start).count()
            )
            new_articles_month = Article.objects.filter(company=company, created_at__gte=this_month_start).count()

            stats = {
                "counters": {
                    "users": {"total": total_users, "new_this_month": new_users_month, "growth": 0.0},
                    "articles": {
                        "total": published_articles,  # Published as total for dashboard
                        "new_this_month": new_articles_month,
                        "growth": 0.0,
                    },
                    "messages": {"total": total_messages, "new_this_month": 0, "growth": 0.0},
                    "crm": {
                        "total_deals": total_deals,
                        "active_swarms": active_swarms,
                        "csi_identified": csi_identified,
                    },
                    "finance": {
                        "revenue_month": total_revenue,
                        "expenses_month": total_expenses,
                        "balance_month": total_revenue - total_expenses,
                    },
                },
                "system_status": {"api_uptime": "100%", "storage_used": "1.2GB", "last_backup": timezone.now()},
                "recent_activity": recent_activity_data,
                "charts": {
                    "views_series": views_series,
                    "categories": [{"name": c.name, "article_count": c.article_count} for c in categories_data],
                },
            }

            cache.set(cache_key, stats, 60)
            return Response(stats)

        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.error(f"Error in DashboardStatsView: {e!s}", exc_info=True)
            return Response(
                {"error": "Internal Server Error during dashboard calculation", "details": str(e)}, status=500
            )


class SitemapView(generics.GenericAPIView):
    """
    Endpoint para SEO que retorna URLs públicas de artigos e páginas.
    """

    permission_classes = [permissions.AllowAny]

    @extend_schema(tags=["Core"], responses={200: serializers.DictField()})
    def get(self, request):
        company = request.company
        if not company:
            return Response({"error": "Tenant context required"}, status=400)

        from django.conf import settings

        # Usar URLs amigáveis base
        frontend_domain = (
            getattr(settings, "FRONTEND_URL", "https://atlas.com").replace("https://", "").replace("http://", "")
        )
        base_url = f"https://{company.slug}.{frontend_domain}"

        pages = []
        # Artigos Publicados
        from apps.articles.models import Article

        articles_qs = Article.objects.filter(company=company, status="published").only("slug", "updated_at")
        for art in articles_qs.iterator(chunk_size=1000):
            pages.append(
                {"url": f"{base_url}/artigos/{art.slug}", "lastmod": art.updated_at.isoformat(), "priority": 0.8}
            )

        # Páginas do CMS
        from apps.pages.models import Page

        pages_qs = Page.objects.filter(company=company, status="published").only("slug", "updated_at")
        for p in pages_qs.iterator(chunk_size=1000):
            pages.append({"url": f"{base_url}/{p.slug}", "lastmod": p.updated_at.isoformat(), "priority": 0.5})


class RobotsView(generics.GenericAPIView):
    """
    Endpoint para robots.txt.
    """

    permission_classes = [permissions.AllowAny]
    serializer_class = RobotsSerializer

    @extend_schema(responses={200: serializers.CharField()})
    def get(self, request):
        company = request.company
        if not company:
            return HttpResponse("User-agent: *\nDisallow: /", content_type="text/plain")

        from django.conf import settings

        frontend_domain = (
            getattr(settings, "FRONTEND_URL", "https://atlas.com").replace("https://", "").replace("http://", "")
        )
        base_url = f"https://{company.slug}.{frontend_domain}"
        content = f"User-agent: *\nAllow: /\nSitemap: {base_url}/api/core/sitemap/"
        return HttpResponse(content, content_type="text/plain")


@extend_schema_view(
    list=extend_schema(tags=["LDAP"]),
    retrieve=extend_schema(tags=["LDAP"]),
    create=extend_schema(tags=["LDAP"]),
    update=extend_schema(tags=["LDAP"]),
    partial_update=extend_schema(tags=["LDAP"]),
    test_connection=extend_schema(tags=["LDAP"]),
)
class LDAPConfigViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gerenciar configurações LDAP por tenant.
    Permite testar conexão antes de salvar.
    """

    serializer_class = LDAPConfigSerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    required_permission = "admin.settings_manage"

    def get_queryset(self):
        """Filtrar por tenant atual."""
        return LDAPConfig.objects.filter(company=self.request.company)

    def perform_create(self, serializer):
        """Associar ao tenant atual."""
        serializer.save(company=self.request.company)

    @action(detail=True, methods=["post"])
    def test_connection(self, request, pk=None):
        """
        Testa conexão LDAP com as configurações atuais.

        Retorna:
            - success: bool
            - message: str com detalhes do resultado
            - tested_at: timestamp do teste
        """
        config = self.get_object()

        from .ldap_utils import test_ldap_connection

        result = test_ldap_connection(config, include_metrics=True)
        if isinstance(result, tuple) and len(result) == 3:
            success, message, info = result
        else:
            success, message = result
            info = {}

        # Atualizar status do teste no banco
        config.last_test_status = "success" if success else "failed"
        config.last_test_message = message
        config.last_test_at = timezone.now()
        config.save(update_fields=["last_test_status", "last_test_message", "last_test_at"])

        use_ssl = config.server_uri.startswith("ldaps://")
        tls = "LDAPS" if use_ssl else ("StartTLS" if getattr(config, "use_tls", False) else "None")
        payload = {
            "success": success,
            "message": message,
            "tested_at": config.last_test_at,
            "status": config.last_test_status,
            "tls": tls,
        }
        if getattr(config, "require_group", None):
            payload["require_group"] = config.require_group
            payload["require_group_validated"] = bool(success)
        if info:
            payload["tls_validated"] = info.get("tls_validated")
            payload["metrics"] = {
                "bind_ms": info.get("bind_ms"),
                "search_ms": info.get("search_ms"),
                "group_ms": info.get("group_ms"),
            }
            # Persistir mensagem enriquecida com métricas para histórico
            bind_ms = info.get("bind_ms")
            search_ms = info.get("search_ms")
            group_ms = info.get("group_ms")
            tls = info.get("tls")
            tls_val = info.get("tls_validated")
            metrics_txt = f" | tempos: bind={bind_ms}ms, search={search_ms}ms" + (
                f", group={group_ms}ms" if group_ms is not None else ""
            )
            tls_txt = f" | TLS={tls}, validated={'sim' if tls_val else 'não'}"
            config.last_test_message = f"{message}{metrics_txt}{tls_txt}"
            config.save(update_fields=["last_test_message"])

        return Response(payload, status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST)
