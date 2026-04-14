from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import models, transaction
from rest_framework.exceptions import ValidationError

from apps.finance.models import Category as FinanceCategory
from apps.finance.models import Transaction as FinanceTransaction

from .models import CompensationProfile, EarningEvent, PayrollLine, PayrollRun, ThirteenthAccrual, ThirteenthPayout


@dataclass(frozen=True)
class GenerateRunParams:
    period_start: date
    period_end: date
    scheduled_pay_date: date
    kind: str = "weekly"
    include_salary: bool = False


class PayrollService:
    @staticmethod
    def _normalize_breakdown(breakdown: object) -> list[dict]:
        if breakdown is None:
            return []
        if not isinstance(breakdown, list):
            raise ValidationError({"detail": "breakdown inválido. Deve ser uma lista."})
        normalized: list[dict] = []
        for item in breakdown:
            if not isinstance(item, dict):
                raise ValidationError({"detail": "breakdown inválido. Itens devem ser objetos."})
            label = item.get("label")
            amount = item.get("amount")
            line_type = item.get("line_type")
            if not isinstance(label, str) or not label.strip():
                raise ValidationError({"detail": "breakdown inválido. label obrigatório."})
            if not isinstance(amount, (str, int, float, Decimal)):
                raise ValidationError({"detail": "breakdown inválido. amount obrigatório."})
            if line_type not in {"earning", "deduction", "provision"}:
                raise ValidationError({"detail": "breakdown inválido. line_type inválido."})
            normalized.append(
                {
                    "label": label.strip(),
                    "amount": Decimal(str(amount)).quantize(Decimal("0.01")),
                    "line_type": line_type,
                }
            )
        return normalized

    @staticmethod
    def _event_amount(company_id: int, event: EarningEvent) -> Decimal:
        breakdown = PayrollService._normalize_breakdown(event.breakdown)
        if breakdown:
            total = sum((x["amount"] for x in breakdown), start=Decimal("0.00"))
            return total.quantize(Decimal("0.01"))

        if event.kind in {"daily", "bonus", "vacation", "thirteenth"}:
            if event.amount is None:
                raise ValidationError({"detail": "Evento sem amount."})
            return Decimal(event.amount)

        if event.kind == "discount":
            if event.amount is None:
                raise ValidationError({"detail": "Evento sem amount."})
            return -abs(Decimal(event.amount))

        if event.kind == "overtime":
            if event.minutes is None:
                raise ValidationError({"detail": "Hora extra sem minutes."})
            multiplier = Decimal(event.multiplier if event.multiplier is not None else Decimal("1.5"))
            profile = CompensationProfile.objects.filter(company_id=company_id, user_id=event.user_id).first()
            if not profile or profile.hourly_rate is None:
                raise ValidationError({"detail": "Perfil sem hourly_rate para calcular hora extra."})
            hours = Decimal(event.minutes) / Decimal(60)
            return (hours * Decimal(profile.hourly_rate) * multiplier).quantize(Decimal("0.01"))

        raise ValidationError({"detail": f"Tipo de evento inválido: {event.kind}"})

    @staticmethod
    @transaction.atomic
    def generate_run(company, user, params: GenerateRunParams) -> PayrollRun:
        if params.period_start > params.period_end:
            raise ValidationError({"detail": "period_start maior que period_end."})

        run = PayrollRun.objects.create(
            company=company,
            kind=params.kind,
            status="draft",
            period_start=params.period_start,
            period_end=params.period_end,
            scheduled_pay_date=params.scheduled_pay_date,
            created_by=user,
        )

        events = (
            EarningEvent.objects.select_for_update()
            .filter(
                company=company,
                status="pending",
                competence_date__range=(params.period_start, params.period_end),
            )
            .order_by("user_id", "competence_date", "id")
        )

        for event in events:
            breakdown = PayrollService._normalize_breakdown(event.breakdown)
            if breakdown:
                for item in breakdown:
                    PayrollLine.objects.create(
                        company=company,
                        payroll_run=run,
                        user_id=event.user_id,
                        label=item["label"],
                        line_type=item["line_type"],
                        amount=item["amount"],
                        source_event=event,
                    )
            else:
                amount = PayrollService._event_amount(company.id, event)
                line_type = "deduction" if amount < 0 else "earning"
                PayrollLine.objects.create(
                    company=company,
                    payroll_run=run,
                    user_id=event.user_id,
                    label=event.get_kind_display(),
                    line_type=line_type,
                    amount=amount,
                    source_event=event,
                )
            event.status = "assigned"
            event.payroll_run = run
            event.save(update_fields=["status", "payroll_run"])

        run.status = "closed"
        run.save(update_fields=["status"])
        return run

    @staticmethod
    @transaction.atomic
    def post_run_to_finance(company, user, run: PayrollRun) -> FinanceTransaction:
        if run.company_id != company.id:
            raise ValidationError({"detail": "Run não pertence ao tenant."})
        if run.status not in {"closed", "paid"}:
            raise ValidationError({"detail": "Run precisa estar fechado antes de postar."})

        total = (
            PayrollLine.objects.filter(company=company, payroll_run=run)
            .aggregate(models.Sum("amount"))
            .get("amount__sum")
        )
        if total is None:
            total = Decimal("0.00")
        total = Decimal(total).quantize(Decimal("0.01"))

        category, _ = FinanceCategory.objects.get_or_create(
            company=company,
            name="Folha",
            defaults={"description": "Pagamentos de folha", "color": "#6366F1"},
        )

        tx = FinanceTransaction.objects.create(
            company=company,
            description=f"Folha {run.period_start.strftime('%d/%m/%Y')} - {run.period_end.strftime('%d/%m/%Y')}",
            amount=abs(total),
            type="out",
            status="pending",
            category=category,
            due_date=run.scheduled_pay_date,
            competence_date=run.period_end,
            created_by=user,
        )

        return tx

    @staticmethod
    def ensure_thirteenth_accrual(
        *, company, user_id: int, year: int, month: int, salary_monthly: Decimal
    ) -> ThirteenthAccrual:
        if month < 1 or month > 12:
            raise ValidationError({"detail": "month inválido. Use 1-12."})
        if year < 2000 or year > 2100:
            raise ValidationError({"detail": "year inválido."})
        amount = (Decimal(salary_monthly) / Decimal(12)).quantize(Decimal("0.01"))
        accrual, created = ThirteenthAccrual.all_objects.get_or_create(
            company=company,
            user_id=user_id,
            year=year,
            month=month,
            defaults={
                "amount": amount,
                "salary_snapshot": Decimal(salary_monthly).quantize(Decimal("0.01")),
                "status": "accrued",
            },
        )
        if not created and accrual.status == "accrued":
            desired_snapshot = Decimal(salary_monthly).quantize(Decimal("0.01"))
            if accrual.salary_snapshot != desired_snapshot or accrual.amount != amount:
                accrual.salary_snapshot = desired_snapshot
                accrual.amount = amount
                accrual.save(update_fields=["salary_snapshot", "amount"])
        return accrual

    @staticmethod
    def generate_thirteenth_installment(
        *,
        company,
        year: int,
        installment: int,
        pay_date: date,
        months: list[int],
    ) -> ThirteenthPayout | None:
        if installment not in {1, 2}:
            raise ValidationError({"detail": "installment inválido. Use 1 ou 2."})
        if not months:
            raise ValidationError({"detail": "months obrigatório."})

        existing = ThirteenthPayout.all_objects.filter(company=company, year=year, installment=installment)
        if existing.exists():
            return None

        with transaction.atomic():
            accruals = (
                ThirteenthAccrual.all_objects.select_for_update()
                .filter(
                    company=company,
                    year=year,
                    month__in=months,
                    status="accrued",
                )
                .order_by("user_id", "month")
            )

            by_user: dict[int, list[ThirteenthAccrual]] = {}
            for a in accruals:
                by_user.setdefault(a.user_id, []).append(a)

            created_any = False
            for user_id, items in by_user.items():
                if ThirteenthPayout.all_objects.filter(
                    company=company,
                    user_id=user_id,
                    year=year,
                    installment=installment,
                ).exists():
                    continue

                total = sum((i.amount for i in items), start=Decimal("0.00")).quantize(Decimal("0.01"))
                if total <= Decimal("0.00"):
                    continue

                label = "13º Salário (1ª parcela)" if installment == 1 else "13º Salário (2ª parcela)"
                breakdown = [{"label": label, "amount": total, "line_type": "earning"}]

                event = EarningEvent.all_objects.create(
                    company=company,
                    kind="thirteenth",
                    user_id=user_id,
                    competence_date=pay_date,
                    amount=total,
                    breakdown=breakdown,
                    payout_mode="monthly",
                    status="pending",
                )

                payout = ThirteenthPayout.all_objects.create(
                    company=company,
                    user_id=user_id,
                    year=year,
                    installment=installment,
                    pay_date=pay_date,
                    amount=total,
                    event=event,
                )

                ThirteenthAccrual.all_objects.filter(pk__in=[x.pk for x in items]).update(status="paid", payout=payout)
                created_any = True

            if not created_any:
                return None
            return ThirteenthPayout.all_objects.filter(company=company, year=year, installment=installment).first()

    @staticmethod
    def build_vacation_event_payload(*, salary_monthly: Decimal, vacation_days: int) -> tuple[Decimal, list[dict]]:
        if vacation_days <= 0 or vacation_days > 30:
            raise ValidationError({"detail": "vacation_days inválido. Use 1-30."})
        base = (Decimal(salary_monthly) / Decimal(30) * Decimal(vacation_days)).quantize(Decimal("0.01"))
        one_third = (base / Decimal(3)).quantize(Decimal("0.01"))
        total = (base + one_third).quantize(Decimal("0.01"))
        breakdown = [
            {"label": "Férias", "amount": base, "line_type": "earning"},
            {"label": "1/3 de Férias", "amount": one_third, "line_type": "earning"},
        ]
        return total, breakdown

    @staticmethod
    def build_thirteenth_payload(
        *, salary_monthly: Decimal, months_worked: int, installment: int
    ) -> tuple[Decimal, list[dict]]:
        if months_worked <= 0 or months_worked > 12:
            raise ValidationError({"detail": "months_worked inválido. Use 1-12."})
        if installment not in {1, 2, 0}:
            raise ValidationError({"detail": "installment inválido. Use 0 (integral), 1 ou 2."})
        total = (Decimal(salary_monthly) * Decimal(months_worked) / Decimal(12)).quantize(Decimal("0.01"))
        if installment == 0:
            return total, [{"label": "13º Salário", "amount": total, "line_type": "earning"}]
        if installment == 1:
            part = (total / Decimal(2)).quantize(Decimal("0.01"))
            return part, [{"label": "13º Salário (1ª parcela)", "amount": part, "line_type": "earning"}]
        part = (total - (total / Decimal(2)).quantize(Decimal("0.01"))).quantize(Decimal("0.01"))
        return part, [{"label": "13º Salário (2ª parcela)", "amount": part, "line_type": "earning"}]
