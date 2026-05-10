from django.urls import path

from .views import (
    ArticlesReportExportView,
    CRMReportExportView,
    FinanceReportExportView,
    PayrollReportExportView,
    ReportTaskDownloadView,
    ReportTaskStatusView,
)

urlpatterns = [
    path("crm/deals/export/", CRMReportExportView.as_view(), name="report-crm-export"),
    path("finance/export/", FinanceReportExportView.as_view(), name="report-finance-export"),
    path("articles/export/", ArticlesReportExportView.as_view(), name="report-articles-export"),
    path("payroll/export/", PayrollReportExportView.as_view(), name="report-payroll-export"),
    path("tasks/<str:task_id>/", ReportTaskStatusView.as_view(), name="report-task-status"),
    path("tasks/<str:task_id>/file/", ReportTaskDownloadView.as_view(), name="report-task-download"),
]
