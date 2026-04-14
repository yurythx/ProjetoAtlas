from __future__ import annotations

import logging
from datetime import date

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.core.models import Company

from .models import CompensationProfile
from .services import PayrollService

logger = logging.getLogger(__name__)


def _previous_month(d: date) -> tuple[int, int]:
    if d.month == 1:
        return d.year - 1, 12
    return d.year, d.month - 1


@shared_task(
    name="apps.payroll.tasks.accrue_thirteenth_previous_month",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    ignore_result=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def accrue_thirteenth_previous_month(self):
    today = timezone.localdate()
    year, month = _previous_month(today)

    for company in Company.objects.all():
        with transaction.atomic():
            profiles = CompensationProfile.all_objects.filter(company=company).select_related("user")
            for profile in profiles:
                if not getattr(profile.user, "is_active", True):
                    continue

                PayrollService.ensure_thirteenth_accrual(
                    company=company,
                    user_id=profile.user_id,
                    year=year,
                    month=month,
                    salary_monthly=profile.salary_monthly,
                )


@shared_task(
    name="apps.payroll.tasks.generate_thirteenth_july",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    ignore_result=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def generate_thirteenth_july(self):
    today = timezone.localdate()
    if today.month != 7:
        return
    year = today.year

    for company in Company.objects.all():
        with transaction.atomic():
            PayrollService.generate_thirteenth_installment(
                company=company,
                year=year,
                installment=1,
                pay_date=date(year, 7, 1),
                months=list(range(1, 7)),
            )


@shared_task(
    name="apps.payroll.tasks.generate_thirteenth_december",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    ignore_result=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
)
def generate_thirteenth_december(self):
    today = timezone.localdate()
    if today.month != 12:
        return
    year = today.year

    for company in Company.objects.all():
        with transaction.atomic():
            PayrollService.generate_thirteenth_installment(
                company=company,
                year=year,
                installment=2,
                pay_date=date(year, 12, 1),
                months=list(range(7, 13)),
            )
