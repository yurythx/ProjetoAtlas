from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CompensationProfileViewSet,
    EarningEventViewSet,
    PayrollRunViewSet,
    ThirteenthAccrualViewSet,
    ThirteenthPayoutViewSet,
)

router = DefaultRouter()
router.register(r"profiles", CompensationProfileViewSet, basename="payroll-profiles")
router.register(r"events", EarningEventViewSet, basename="payroll-events")
router.register(r"runs", PayrollRunViewSet, basename="payroll-runs")
router.register(r"thirteenth-accruals", ThirteenthAccrualViewSet, basename="payroll-thirteenth-accruals")
router.register(r"thirteenth-payouts", ThirteenthPayoutViewSet, basename="payroll-thirteenth-payouts")

urlpatterns = [
    path("", include(router.urls)),
]
