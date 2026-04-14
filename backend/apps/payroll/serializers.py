from rest_framework import serializers

from .models import (
    CompensationProfile,
    EarningEvent,
    PayrollLine,
    PayrollRun,
    ThirteenthAccrual,
    ThirteenthPayout,
)


class CompensationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompensationProfile
        fields = [
            "id",
            "company",
            "user",
            "salary_monthly",
            "weekly_hours",
            "hourly_rate",
            "extras_payout_mode",
            "extras_weekday",
        ]
        read_only_fields = ["id", "company"]


class EarningEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = EarningEvent
        fields = [
            "id",
            "company",
            "kind",
            "user",
            "competence_date",
            "amount",
            "minutes",
            "multiplier",
            "breakdown",
            "payout_mode",
            "payout_weekday",
            "status",
            "payroll_run",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "company", "status", "payroll_run", "created_by", "created_at"]


class PayrollLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollLine
        fields = [
            "id",
            "company",
            "payroll_run",
            "user",
            "label",
            "line_type",
            "amount",
            "source_event",
            "created_at",
        ]
        read_only_fields = ["id", "company", "created_at"]


class PayrollRunSerializer(serializers.ModelSerializer):
    lines = PayrollLineSerializer(many=True, read_only=True)

    class Meta:
        model = PayrollRun
        fields = [
            "id",
            "company",
            "kind",
            "status",
            "period_start",
            "period_end",
            "scheduled_pay_date",
            "created_by",
            "created_at",
            "lines",
        ]
        read_only_fields = ["id", "company", "created_by", "created_at", "lines"]


class ThirteenthAccrualSerializer(serializers.ModelSerializer):
    class Meta:
        model = ThirteenthAccrual
        fields = [
            "id",
            "company",
            "user",
            "year",
            "month",
            "amount",
            "salary_snapshot",
            "status",
            "payout",
            "created_at",
        ]
        read_only_fields = ["id", "company", "created_at"]


class ThirteenthPayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = ThirteenthPayout
        fields = [
            "id",
            "company",
            "user",
            "year",
            "installment",
            "pay_date",
            "amount",
            "event",
            "created_at",
        ]
        read_only_fields = ["id", "company", "created_at"]
