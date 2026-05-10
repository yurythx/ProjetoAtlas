from django.core.cache import cache
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .tasks import generate_articles_report, generate_crm_report, generate_finance_report, generate_payroll_report


class CRMReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        fmt = request.data.get("format", "csv")
        if fmt not in ("csv", "pdf"):
            return Response({"detail": "format must be 'csv' or 'pdf'"}, status=status.HTTP_400_BAD_REQUEST)

        filters = {
            "record_type": request.data.get("record_type"),
            "is_closed": request.data.get("is_closed"),
            "priority": request.data.get("priority"),
        }

        task = generate_crm_report.delay(request.company.id, fmt, filters)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class FinanceReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        fmt = request.data.get("format", "csv")
        if fmt not in ("csv", "pdf"):
            return Response({"detail": "format must be 'csv' or 'pdf'"}, status=status.HTTP_400_BAD_REQUEST)

        filters = {
            "type": request.data.get("type"),
            "status": request.data.get("status"),
            "period": request.data.get("period"),
            "start_date": request.data.get("start_date"),
            "end_date": request.data.get("end_date"),
        }

        task = generate_finance_report.delay(request.company.id, fmt, filters)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class ArticlesReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        fmt = request.data.get("format", "csv")
        if fmt not in ("csv", "pdf"):
            return Response({"detail": "format must be 'csv' or 'pdf'"}, status=status.HTTP_400_BAD_REQUEST)

        filters = {
            "status": request.data.get("status"),
            "is_public": request.data.get("is_public"),
            "category": request.data.get("category"),
        }

        task = generate_articles_report.delay(request.company.id, fmt, filters)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class PayrollReportExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        fmt = request.data.get("format", "csv")
        if fmt not in ("csv", "pdf"):
            return Response({"detail": "format must be 'csv' or 'pdf'"}, status=status.HTTP_400_BAD_REQUEST)

        filters = {
            "status": request.data.get("status"),
            "period_start": request.data.get("period_start"),
            "period_end": request.data.get("period_end"),
        }

        task = generate_payroll_report.delay(request.company.id, fmt, filters)
        return Response({"task_id": task.id}, status=status.HTTP_202_ACCEPTED)


class ReportTaskStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        data = cache.get(f"report:{task_id}")
        if data is None:
            return Response({"status": "not_found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({"status": data["status"], "detail": data.get("detail")})


class ReportTaskDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, task_id):
        data = cache.get(f"report:{task_id}")
        if data is None:
            return Response({"detail": "Report not found or expired."}, status=status.HTTP_404_NOT_FOUND)
        if data.get("status") != "done":
            return Response({"detail": "Report not ready yet.", "status": data.get("status")}, status=status.HTTP_409_CONFLICT)

        response = HttpResponse(data["content"], content_type=data["content_type"])
        response["Content-Disposition"] = f'attachment; filename="{data["filename"]}"'
        return response
