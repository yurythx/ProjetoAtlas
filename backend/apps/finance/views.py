from datetime import date

from django.db import transaction
from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

from apps.accounts.permissions import ActionRolePermission
from apps.module_manager.permissions import HasModuleAccess

from .models import Category, Transaction
from .serializers import CategorySerializer, TransactionSerializer


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


def _parse_range(request):
    start_raw = request.query_params.get("start")
    end_raw = request.query_params.get("end")
    if not start_raw and not end_raw:
        return None, None

    start = parse_date(start_raw) if start_raw else None
    end = parse_date(end_raw) if end_raw else None
    if start_raw and not start:
        raise ValidationError({"start": "Data inválida. Use YYYY-MM-DD."})
    if end_raw and not end:
        raise ValidationError({"end": "Data inválida. Use YYYY-MM-DD."})

    if start and end and start > end:
        raise ValidationError({"detail": "Intervalo inválido: start maior que end."})

    if start and not end:
        end = date.today()
    if end and not start:
        start = date(1970, 1, 1)

    return start, end


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
        "create": "finance.view_financial",
        "update": "finance.view_financial",
        "partial_update": "finance.view_financial",
        "destroy": "finance.view_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return Category.objects.none()
        qs = Category.objects.filter(company=company).order_by("name")
        if not _has_permission(self.request, "finance.manage_financial"):
            qs = qs.filter(Q(is_shared=True) | Q(created_by=self.request.user))
        return qs

    def perform_create(self, serializer):
        company = _get_company(self.request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})
        can_manage = _has_permission(self.request, "finance.manage_financial")
        is_shared = bool(serializer.validated_data.get("is_shared", True))
        if not can_manage:
            is_shared = False
        serializer.save(company=company, created_by=self.request.user, is_shared=is_shared)

    def perform_update(self, serializer):
        instance: Category = self.get_object()
        can_manage = _has_permission(self.request, "finance.manage_financial")
        if not can_manage:
            if instance.is_shared:
                raise ValidationError({"detail": "Você não pode alterar categorias compartilhadas."})
            if instance.created_by_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode alterar suas próprias categorias."})
            if serializer.validated_data.get("is_shared") is True:
                raise ValidationError({"detail": "Você não pode tornar a categoria compartilhada."})
        serializer.save()

    @transaction.atomic
    def perform_destroy(self, instance):
        can_manage = _has_permission(self.request, "finance.manage_financial")
        if not can_manage:
            if instance.is_shared:
                raise ValidationError({"detail": "Você não pode excluir categorias compartilhadas."})
            if instance.created_by_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode excluir suas próprias categorias."})
        if instance.transactions.exists():
            raise ValidationError({"detail": "Categoria em uso. Remova das transações antes de excluir."})
        instance.delete()


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "finance"
    action_permissions = {
        "list": "finance.view_financial",
        "retrieve": "finance.view_financial",
        "create": "finance.view_financial",
        "update": "finance.view_financial",
        "partial_update": "finance.view_financial",
        "destroy": "finance.view_financial",
    }

    def get_queryset(self):
        company = _get_company(self.request)
        if not company:
            return Transaction.objects.none()

        qs = (
            Transaction.objects.select_related("category")
            .prefetch_related("attachments", "attachments__uploaded_by")
            .filter(company=company)
            .order_by("-competence_date", "-due_date", "-id")
        )
        can_manage = _has_permission(self.request, "finance.manage_financial")
        if not can_manage:
            qs = qs.filter(created_by=self.request.user)
        elif self.request.query_params.get("mine") in {"1", "true", "True"}:
            qs = qs.filter(created_by=self.request.user)
        start, end = _parse_range(self.request)
        if start and end:
            qs = qs.filter(competence_date__range=(start, end))
        return qs

    def perform_create(self, serializer):
        company = _get_company(self.request)
        if not company:
            raise ValidationError({"detail": "Contexto de empresa ausente."})
        serializer.save(created_by=self.request.user, company=company)

    def perform_update(self, serializer):
        instance: Transaction = self.get_object()

        # Check if month is closed before update
        from .models import MonthClosing
        if MonthClosing.objects.filter(company=instance.company, month=instance.competence_date.month, year=instance.competence_date.year).exists():
            raise ValidationError({"detail": "Mês fechado. Não é possível alterar esta transação."})

        if not _has_permission(self.request, "finance.manage_financial"):
            if instance.created_by_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode alterar transações criadas por você."})
            if instance.status != "pending" or instance.payment_date is not None:
                raise ValidationError({"detail": "Esta transação não pode mais ser alterada (já foi paga/fechada)."})
        serializer.save()

    def perform_destroy(self, instance):
        # Check if month is closed before destroy
        from .models import MonthClosing
        if MonthClosing.objects.filter(company=instance.company, month=instance.competence_date.month, year=instance.competence_date.year).exists():
            raise ValidationError({"detail": "Mês fechado. Não é possível excluir esta transação."})

        if not _has_permission(self.request, "finance.manage_financial"):
            if instance.created_by_id != self.request.user.id:
                raise ValidationError({"detail": "Você só pode excluir transações criadas por você."})
            if instance.status != "pending" or instance.payment_date is not None:
                raise ValidationError({"detail": "Esta transação não pode mais ser excluída (já foi paga/fechada)."})
        instance.delete()
