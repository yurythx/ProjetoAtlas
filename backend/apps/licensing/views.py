from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.articles.models import Article
from config.pagination import DefaultPagination

from .models import Feature, License, Plan, PlanFeature
from .serializers import FeatureSerializer, LicenseSerializer, PlanSerializer, UsageResponseSerializer


@extend_schema_view(
    list=extend_schema(tags=["Licensing"]),
    retrieve=extend_schema(tags=["Licensing"]),
)
class FeatureViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lista features disponíveis (apenas leitura para usuários).
    """

    queryset = Feature.objects.all().order_by("id")
    serializer_class = FeatureSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = DefaultPagination


@extend_schema_view(
    list=extend_schema(tags=["Licensing"]),
    retrieve=extend_schema(tags=["Licensing"]),
)
class PlanViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lista planos disponíveis (apenas leitura para usuários).
    """

    queryset = Plan.objects.all().order_by("price")
    serializer_class = PlanSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = DefaultPagination


@extend_schema_view(
    list=extend_schema(tags=["Licensing"]),
    retrieve=extend_schema(tags=["Licensing"]),
    create=extend_schema(tags=["Licensing"]),
    update=extend_schema(tags=["Licensing"]),
    partial_update=extend_schema(tags=["Licensing"]),
    destroy=extend_schema(tags=["Licensing"]),
    usage=extend_schema(
        tags=["Licensing"], responses={200: UsageResponseSerializer}, summary="Get current usage vs limits"
    ),
    checkout=extend_schema(
        tags=["Licensing"], responses={201: LicenseSerializer}, summary="Checkout/Simulate plan upgrade"
    ),
)
class LicenseViewSet(viewsets.ModelViewSet):
    """
    Gerencia a licença do tenant atual.
    """

    serializer_class = LicenseSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = DefaultPagination

    def get_queryset(self):
        # Retorna apenas a licença da empresa atual
        return License.objects.filter(company=self.request.company).order_by("-start_date")

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)

    @action(detail=False, methods=["get"])
    def usage(self, request):
        """
        Calcula o consumo atual vs limites do plano.
        """
        company = request.company
        User = get_user_model()

        # Get active license
        active_license = License.objects.filter(company=company, is_active=True).first()
        if not active_license:
            return Response({"error": "No active license"}, status=400)

        plan_features = PlanFeature.objects.filter(plan=active_license.plan).select_related("feature")
        limits = {pf.feature.code: pf.value for pf in plan_features}

        # Calculate current usage
        usage = {
            "users": {
                "current": User.objects.filter(company=company).count(),
                "limit": int(limits.get("max_users", 0)) if limits.get("max_users") != "unlimited" else -1,
                "label": "Users",
            },
            "articles": {
                "current": Article.objects.filter(company=company).count(),
                "limit": int(limits.get("max_articles", 0)) if limits.get("max_articles") != "unlimited" else -1,
                "label": "Articles",
            },
            "storage_mb": {
                "current": 450,  # Placeholder until we implement proper storage tracking
                "limit": int(limits.get("storage_limit_mb", 0))
                if limits.get("storage_limit_mb") != "unlimited"
                else -1,
                "label": "Storage (MB)",
            },
        }

        return Response({"plan": active_license.plan.name, "usage": usage, "limits": limits})

    @action(detail=False, methods=["post"])
    def checkout(self, request):
        """
        Simula um checkout real e ativa o novo plano para a empresa.
        """
        plan_id = request.data.get("plan_id")
        if not plan_id:
            return Response({"error": "Plan ID is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            plan = Plan.objects.get(id=plan_id)
        except Plan.DoesNotExist:
            return Response({"error": "Plan not found"}, status=status.HTTP_404_NOT_FOUND)

        # Deactivate current licenses for this company
        License.objects.filter(company=request.company, is_active=True).update(is_active=False)

        # Create new license
        new_license = License.objects.create(company=request.company, plan=plan, is_active=True)

        # Audit Log
        from apps.core.models import AuditLog

        AuditLog.objects.create(
            company=request.company,
            user=request.user,
            resource="License",
            resource_id=str(new_license.id),
            action=f"UPGRADE_PLAN: {plan.name}",
            details={"price": str(plan.price), "plan_id": plan.id},
        )

        return Response(LicenseSerializer(new_license, context={"request": request}).data)
