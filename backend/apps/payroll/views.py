from django.utils.dateparse import parse_date
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import ActionRolePermission
from apps.module_manager.permissions import HasModuleAccess

from .models import CompensationProfile, EarningEvent, PayrollRun, ThirteenthAccrual, ThirteenthPayout
from .serializers import (
    CompensationProfileSerializer,
    EarningEventSerializer,
    PayrollRunSerializer,
    ThirteenthAccrualSerializer,
    ThirteenthPayoutSerializer,
)
from .services import GenerateRunParams, PayrollService


def _get_company(request):
    company = getattr(request, "company", None)
    if not company and getattr(request, "user", None) and getattr(request.user, "company", None):
        company = request.user.company
    return company


def _has_permission(request, perm: str) -> bool:
    user = getattr(request, "user", None)
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    role = getattr(user, "role", None)
    if not role:
        return False
    return perm in (role.permissions or [])


class CompensationProfileViewSet(viewsets.ModelViewSet):
    queryset = CompensationProfile.objects.all()
    serializer_class = CompensationProfileSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
        "create": "finance.manage_financial",
        "update": "finance.manage_financial",
        "partial_update": "finance.manage_financial",
        "destroy": "finance.manage_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return CompensationProfile.objects.none()
        qs = CompensationProfile.objects.filter(company=company).select_related("user").order_by("user_id")
        if not _has_permission(self.request, "finance.manage_financial"):
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        company = _get_company(self.request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})
        serializer.save(company=company)


class EarningEventViewSet(viewsets.ModelViewSet):
    queryset = EarningEvent.objects.all()
    serializer_class = EarningEventSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
        "create": "finance.view_financial",
        "update": "finance.view_financial",
        "partial_update": "finance.view_financial",
        "destroy": "finance.view_financial",
        "generate_vacation": "finance.manage_financial",
        "generate_thirteenth": "finance.manage_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return EarningEvent.objects.none()
        qs = (
            EarningEvent.objects.filter(company=company)
            .select_related("user", "payroll_run")
            .order_by("-competence_date", "-id")
        )
        if not _has_permission(self.request, "finance.manage_financial"):
            qs = qs.filter(user=self.request.user)
        return qs

    def perform_create(self, serializer):
        company = _get_company(self.request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})
        if not _has_permission(self.request, "finance.manage_financial"):
            target_user = serializer.validated_data.get("user")
            if target_user and target_user.id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode lançar eventos para o seu próprio usuário."})
        serializer.save(company=company, created_by=self.request.user)

    def perform_update(self, serializer):
        instance: EarningEvent = self.get_object()
        if not _has_permission(self.request, "finance.manage_financial"):
            if instance.user_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode alterar eventos do seu próprio usuário."})
            if instance.created_by_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode alterar eventos criados por você."})
            if instance.status != "pending" or instance.payroll_run_id is not None:
                raise ValidationError({"detail": "Este evento não pode mais ser alterado (já foi fechado)."})
            target_user = serializer.validated_data.get("user")
            if target_user and target_user.id != self.request.user.id:
                raise ValidationError({"detail": "Você não pode transferir eventos para outro usuário."})
        serializer.save()

    def perform_destroy(self, instance):
        if not _has_permission(self.request, "finance.manage_financial"):
            if instance.user_id != self.request.user.id or instance.created_by_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode excluir eventos criados por você."})
            if instance.status != "pending" or instance.payroll_run_id is not None:
                raise ValidationError({"detail": "Este evento não pode mais ser excluído (já foi fechado)."})
        instance.delete()

    @action(detail=False, methods=["post"], url_path="generate_vacation")
    def generate_vacation(self, request):
        company = _get_company(request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})

        user_id = request.data.get("user")
        start_raw = request.data.get("start")
        end_raw = request.data.get("end")
        pay_raw = request.data.get("pay_date")
        payout_mode = request.data.get("payout_mode") or "monthly"
        payout_weekday = request.data.get("payout_weekday")

        start = parse_date(start_raw) if start_raw else None
        end = parse_date(end_raw) if end_raw else None
        pay_date = parse_date(pay_raw) if pay_raw else None
        if not user_id or not start or not end:
            raise ValidationError({"detail": "Campos obrigatórios: user, start, end (YYYY-MM-DD)."})
        if start > end:
            raise ValidationError({"detail": "start maior que end."})

        profile = CompensationProfile.objects.filter(company=company, user_id=user_id).first()
        if not profile:
            raise ValidationError({"detail": "Perfil de remuneração não encontrado para o usuário."})

        vacation_days = (end - start).days + 1
        total, breakdown = PayrollService.build_vacation_event_payload(
            salary_monthly=profile.salary_monthly,
            vacation_days=vacation_days,
        )

        competence_date = pay_date or start
        event = EarningEvent.objects.create(
            company=company,
            kind="vacation",
            user_id=user_id,
            competence_date=competence_date,
            amount=total,
            breakdown=breakdown,
            payout_mode=payout_mode,
            payout_weekday=payout_weekday if payout_mode == "weekday" else None,
            created_by=request.user,
        )
        return Response(
            EarningEventSerializer(event, context={"request": request}).data, status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=["post"], url_path="generate_thirteenth")
    def generate_thirteenth(self, request):
        company = _get_company(request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})

        user_id = request.data.get("user")
        year = request.data.get("year")
        months_worked = request.data.get("months_worked")
        installment = request.data.get("installment", 0)
        pay_raw = request.data.get("pay_date")
        payout_mode = request.data.get("payout_mode") or "monthly"
        payout_weekday = request.data.get("payout_weekday")

        pay_date = parse_date(pay_raw) if pay_raw else None
        if not user_id or not year or not months_worked or not pay_date:
            raise ValidationError({"detail": "Campos obrigatórios: user, year, months_worked, pay_date."})

        try:
            months_worked_i = int(months_worked)
            installment_i = int(installment)
        except Exception:
            raise ValidationError({"detail": "months_worked e installment devem ser números."})

        profile = CompensationProfile.objects.filter(company=company, user_id=user_id).first()
        if not profile:
            raise ValidationError({"detail": "Perfil de remuneração não encontrado para o usuário."})

        amount, breakdown = PayrollService.build_thirteenth_payload(
            salary_monthly=profile.salary_monthly,
            months_worked=months_worked_i,
            installment=installment_i,
        )

        event = EarningEvent.objects.create(
            company=company,
            kind="thirteenth",
            user_id=user_id,
            competence_date=pay_date,
            amount=amount,
            breakdown=breakdown,
            payout_mode=payout_mode,
            payout_weekday=payout_weekday if payout_mode == "weekday" else None,
            created_by=request.user,
        )
        return Response(
            EarningEventSerializer(event, context={"request": request}).data, status=status.HTTP_201_CREATED
        )


class PayrollRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
        "generate": "finance.manage_financial",
        "post_to_finance": "finance.manage_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return PayrollRun.objects.none()
        qs = PayrollRun.objects.filter(company=company).prefetch_related("lines", "lines__user").order_by("-period_end", "-id")
        if not _has_permission(self.request, "finance.manage_financial"):
            qs = qs.filter(lines__user=self.request.user).distinct()
        return qs

    @action(detail=False, methods=["post"], url_path="generate")
    def generate(self, request):
        company = _get_company(request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})

        start_raw = request.data.get("start")
        end_raw = request.data.get("end")
        pay_raw = request.data.get("pay_date")
        kind = request.data.get("kind") or "weekly"

        start = parse_date(start_raw) if start_raw else None
        end = parse_date(end_raw) if end_raw else None
        pay_date = parse_date(pay_raw) if pay_raw else None
        if not start or not end or not pay_date:
            raise ValidationError({"detail": "Campos obrigatórios: start, end, pay_date (YYYY-MM-DD)."})
        if start > end:
            raise ValidationError({"detail": "start maior que end."})
        if kind not in {"weekly", "weekday", "monthly", "manual"}:
            raise ValidationError({"detail": "kind inválido."})

        run = PayrollService.generate_run(
            company=company,
            user=request.user,
            params=GenerateRunParams(
                period_start=start,
                period_end=end,
                scheduled_pay_date=pay_date,
                kind=kind,
            ),
        )
        return Response(PayrollRunSerializer(run, context={"request": request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="post_to_finance")
    def post_to_finance(self, request, pk=None):
        company = _get_company(request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})

        run: PayrollRun = self.get_object()
        tx = PayrollService.post_run_to_finance(company=company, user=request.user, run=run)
        return Response({"transaction_id": tx.id}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="sign")
    def sign(self, request, pk=None):
        """Permite que o funcionário assine digitalmente seu holerite."""
        from django.utils import timezone

        run: PayrollRun = self.get_object()

        # Verificar se o usuário atual é o dono das linhas deste holerite
        if not run.lines.filter(user=request.user).exists():
            raise ValidationError({"detail": "Você não possui holerites neste fechamento."})

        if run.employee_signature_date:
            raise ValidationError({"detail": "Este holerite já foi assinado."})

        run.employee_signature_date = timezone.now()
        run.employee_signature_ip = request.META.get("HTTP_X_FORWARDED_FOR") or request.META.get("REMOTE_ADDR")
        run.save(update_fields=["employee_signature_date", "employee_signature_ip"])

        return Response({"detail": "Holerite assinado com sucesso."}, status=status.HTTP_200_OK)


class ThirteenthAccrualViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ThirteenthAccrual.objects.all()
    serializer_class = ThirteenthAccrualSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return ThirteenthAccrual.objects.none()
        qs = ThirteenthAccrual.all_objects.select_related("user").filter(company=company).order_by("-year", "-month", "-id")
        if not _has_permission(self.request, "finance.manage_financial"):
            qs = qs.filter(user=self.request.user)
        year = self.request.query_params.get("year")
        user_id = self.request.query_params.get("user")
        if year:
            try:
                qs = qs.filter(year=int(year))
            except Exception:
                pass
        if user_id and _has_permission(self.request, "finance.manage_financial"):
            try:
                qs = qs.filter(user_id=int(user_id))
            except Exception:
                pass
        return qs


class ThirteenthPayoutViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ThirteenthPayout.objects.all()
    serializer_class = ThirteenthPayoutSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return ThirteenthPayout.objects.none()
        qs = ThirteenthPayout.all_objects.select_related("user").filter(company=company).order_by("-year", "-installment", "-id")
        if not _has_permission(self.request, "finance.manage_financial"):
            qs = qs.filter(user=self.request.user)
        year = self.request.query_params.get("year")
        user_id = self.request.query_params.get("user")
        if year:
            try:
                qs = qs.filter(year=int(year))
            except Exception:
                pass
        if user_id and _has_permission(self.request, "finance.manage_financial"):
            try:
                qs = qs.filter(user_id=int(user_id))
            except Exception:
                pass
        return qs
