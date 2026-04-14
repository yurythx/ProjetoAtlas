from decimal import Decimal

from django.conf import settings
from django.db import models

from shared_kernel.models import BaseTenantModel


class CompensationProfile(BaseTenantModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="compensation_profiles",
    )
    salary_monthly = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    weekly_hours = models.PositiveSmallIntegerField(default=44)
    hourly_rate = models.DecimalField(max_digits=12, decimal_places=4, null=True, blank=True)

    extras_payout_mode = models.CharField(
        max_length=20,
        choices=[
            ("weekly", "Semanal"),
            ("weekday", "Dia da Semana"),
            ("monthly", "Mensal"),
        ],
        default="weekly",
    )
    extras_weekday = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("company", "user")
        indexes = [
            models.Index(fields=["company", "user"]),
        ]

    def __str__(self):
        return f"{self.company_id}:{self.user_id}"


class PayrollRun(BaseTenantModel):
    kind = models.CharField(
        max_length=20,
        choices=[
            ("weekly", "Semanal"),
            ("weekday", "Dia da Semana"),
            ("monthly", "Mensal"),
            ("manual", "Manual"),
        ],
        default="weekly",
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=[
            ("draft", "Rascunho"),
            ("closed", "Fechado"),
            ("paid", "Pago"),
            ("cancelled", "Cancelado"),
        ],
        default="draft",
        db_index=True,
    )
    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    scheduled_pay_date = models.DateField(db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_payroll_runs",
    )
    # Assinatura digital do funcionário no holerite
    employee_signature_date = models.DateTimeField(null=True, blank=True)
    employee_signature_ip = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "period_start", "period_end"]),
            models.Index(fields=["company", "scheduled_pay_date"]),
            models.Index(fields=["company", "status"]),
        ]

    def __str__(self):
        return f"{self.company_id}:{self.period_start}:{self.period_end}"


class EarningEvent(BaseTenantModel):
    kind = models.CharField(
        max_length=20,
        choices=[
            ("daily", "Diária"),
            ("overtime", "Hora Extra"),
            ("bonus", "Bônus"),
            ("discount", "Desconto"),
            ("vacation", "Férias"),
            ("thirteenth", "13º"),
        ],
        db_index=True,
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="earning_events")
    competence_date = models.DateField(db_index=True)

    amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    minutes = models.PositiveIntegerField(null=True, blank=True)
    multiplier = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
    breakdown = models.JSONField(default=list, blank=True)

    payout_mode = models.CharField(
        max_length=20,
        choices=[
            ("weekly", "Semanal"),
            ("weekday", "Dia da Semana"),
            ("monthly", "Mensal"),
        ],
        default="weekly",
        db_index=True,
    )
    payout_weekday = models.PositiveSmallIntegerField(null=True, blank=True)

    status = models.CharField(
        max_length=20,
        choices=[
            ("pending", "Pendente"),
            ("assigned", "Atribuído"),
            ("paid", "Pago"),
            ("cancelled", "Cancelado"),
        ],
        default="pending",
        db_index=True,
    )
    payroll_run = models.ForeignKey(
        PayrollRun,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="events",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_earning_events",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "competence_date"]),
            models.Index(fields=["company", "user", "competence_date"]),
            models.Index(fields=["company", "status"]),
        ]

    def __str__(self):
        return f"{self.company_id}:{self.kind}:{self.user_id}:{self.competence_date}"


class PayrollLine(BaseTenantModel):
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name="lines")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payroll_lines")
    label = models.CharField(max_length=200)
    line_type = models.CharField(
        max_length=20,
        choices=[
            ("earning", "Provento"),
            ("deduction", "Desconto"),
            ("provision", "Provisão"),
        ],
        default="earning",
        db_index=True,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    source_event = models.ForeignKey(
        EarningEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="lines",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "payroll_run"]),
            models.Index(fields=["company", "user"]),
        ]

    def __str__(self):
        return f"{self.payroll_run_id}:{self.user_id}:{self.amount}"


class ThirteenthPayout(BaseTenantModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="thirteenth_payouts")
    year = models.PositiveSmallIntegerField(db_index=True)
    installment = models.PositiveSmallIntegerField(db_index=True)
    pay_date = models.DateField(db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    event = models.ForeignKey(
        EarningEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="thirteenth_payouts",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("company", "user", "year", "installment")
        indexes = [
            models.Index(fields=["company", "year", "installment"]),
            models.Index(fields=["company", "pay_date"]),
        ]

    def __str__(self):
        return f"{self.company_id}:{self.user_id}:{self.year}:{self.installment}"


class ThirteenthAccrual(BaseTenantModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="thirteenth_accruals")
    year = models.PositiveSmallIntegerField(db_index=True)
    month = models.PositiveSmallIntegerField(db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    salary_snapshot = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[
            ("accrued", "Provisionado"),
            ("paid", "Pago"),
            ("cancelled", "Cancelado"),
        ],
        default="accrued",
        db_index=True,
    )
    payout = models.ForeignKey(
        ThirteenthPayout,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accruals",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("company", "user", "year", "month")
        indexes = [
            models.Index(fields=["company", "user", "year", "month"]),
            models.Index(fields=["company", "year", "status"]),
        ]

    def __str__(self):
        return f"{self.company_id}:{self.user_id}:{self.year}-{self.month:02d}"
