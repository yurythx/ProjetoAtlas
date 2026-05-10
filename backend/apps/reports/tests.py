"""
Tests for the reports app.

Coverage:
- POST /api/reports/crm/deals/export/   -> 202 + task_id
- POST /api/reports/finance/export/     -> 202 + task_id
- GET  /api/reports/tasks/<id>/         -> status polling
- GET  /api/reports/tasks/<id>/file/    -> download when done, 409 when pending
- Invalid format -> 400
- Unauthenticated -> 401
- generate_crm_report task (CSV + PDF)
- generate_finance_report task (CSV + PDF)
"""

from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from factories import (
    ArticleFactory,
    ColumnFactory,
    CompanyFactory,
    DealFactory,
    PayrollLineFactory,
    PayrollRunFactory,
    PipelineFactory,
    TransactionFactory,
    UserFactory,
)


# ---------------------------------------------------------------------------
# Auth guard tests
# ---------------------------------------------------------------------------


class ReportViewAuthTest(APITestCase):
    def test_articles_export_requires_auth(self):
        res = self.client.post(reverse("report-articles-export"), {"format": "csv"})
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_crm_export_requires_auth(self):
        res = self.client.post(reverse("report-crm-export"), {"format": "csv"})
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_finance_export_requires_auth(self):
        res = self.client.post(reverse("report-finance-export"), {"format": "csv"})
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_payroll_export_requires_auth(self):
        res = self.client.post(reverse("report-payroll-export"), {"format": "csv"})
        self.assertIn(res.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


# ---------------------------------------------------------------------------
# View-level tests (Celery task is mocked out)
# ---------------------------------------------------------------------------


class ReportExportViewTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        self.client.force_authenticate(user=self.user)
        self.client.defaults["HTTP_X_COMPANY_SLUG"] = self.company.slug

    @patch("apps.reports.views.generate_crm_report")
    def test_crm_export_returns_202_with_task_id(self, mock_task):
        mock_task.delay.return_value = MagicMock(id="fake-task-1")
        res = self.client.post(reverse("report-crm-export"), {"format": "csv"})
        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(res.data["task_id"], "fake-task-1")

    @patch("apps.reports.views.generate_finance_report")
    def test_finance_export_returns_202_with_task_id(self, mock_task):
        mock_task.delay.return_value = MagicMock(id="fake-task-2")
        res = self.client.post(reverse("report-finance-export"), {"format": "pdf"})
        self.assertEqual(res.status_code, status.HTTP_202_ACCEPTED)
        self.assertIn("task_id", res.data)

    def test_invalid_format_returns_400(self):
        for view_name in ("report-crm-export", "report-finance-export"):
            res = self.client.post(reverse(view_name), {"format": "xlsx"})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST, f"Expected 400 for {view_name}")

    def test_task_status_not_found(self):
        res = self.client.get(reverse("report-task-status", args=["nonexistent-id"]))
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_task_status_processing(self):
        cache.set("report:task-abc", {"status": "processing"}, timeout=60)
        res = self.client.get(reverse("report-task-status", args=["task-abc"]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "processing")

    def test_task_status_done(self):
        cache.set(
            "report:task-done",
            {"status": "done", "content": b"data", "filename": "r.csv", "content_type": "text/csv"},
            timeout=60,
        )
        res = self.client.get(reverse("report-task-status", args=["task-done"]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "done")

    def test_download_pending_returns_409(self):
        cache.set("report:task-pending", {"status": "processing"}, timeout=60)
        res = self.client.get(reverse("report-task-download", args=["task-pending"]))
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)

    def test_download_done_streams_file(self):
        cache.set(
            "report:task-ready",
            {
                "status": "done",
                "content": b"col1,col2\n1,2\n",
                "filename": "test.csv",
                "content_type": "text/csv",
            },
            timeout=60,
        )
        res = self.client.get(reverse("report-task-download", args=["task-ready"]))
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res["Content-Type"], "text/csv")
        self.assertIn("test.csv", res["Content-Disposition"])


# ---------------------------------------------------------------------------
# Task-level tests (run synchronously via .apply())
# ---------------------------------------------------------------------------


def _run_report_task(task_fn, *args):
    """
    Execute a report Celery task synchronously (via .apply()) and return a
    dict of all values written to cache, keyed by cache key.
    """
    import apps.reports.tasks as tasks_module

    stored = {}

    def fake_set(key, value, timeout=None):
        stored[key] = value

    with patch.object(tasks_module, "cache") as mock_cache:
        mock_cache.set.side_effect = fake_set
        task_fn.apply(args=list(args))

    return stored


def _done_entry(stored: dict) -> dict:
    """Return the first cache entry whose status is 'done'."""
    return next(v for v in stored.values() if v.get("status") == "done")


class GenerateCRMReportTaskTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        pipeline = PipelineFactory(company=self.company)
        col = ColumnFactory(company=self.company, pipeline=pipeline)
        user = UserFactory(company=self.company)
        DealFactory.create_batch(3, company=self.company, column=col, owner=user)

    def test_generates_csv(self):
        from apps.reports.tasks import generate_crm_report

        data = _done_entry(_run_report_task(generate_crm_report, self.company.id, "csv", {}))
        self.assertEqual(data["content_type"], "text/csv")
        content = data["content"].decode("utf-8-sig")
        self.assertIn("Título", content)

    def test_generates_pdf(self):
        from apps.reports.tasks import generate_crm_report

        data = _done_entry(_run_report_task(generate_crm_report, self.company.id, "pdf", {}))
        self.assertEqual(data["content_type"], "application/pdf")
        self.assertTrue(data["content"].startswith(b"%PDF"))

    def test_csv_filters_by_record_type(self):
        from apps.reports.tasks import generate_crm_report

        # DealFactory defaults to "incident"; filtering for "change" should produce only a header row
        data = _done_entry(
            _run_report_task(generate_crm_report, self.company.id, "csv", {"record_type": "change"})
        )
        lines = [l for l in data["content"].decode("utf-8-sig").splitlines() if l.strip()]
        self.assertEqual(len(lines), 1, "Only the header row expected when filter matches no deals")


class GenerateFinanceReportTaskTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        user = UserFactory(company=self.company)
        TransactionFactory.create_batch(3, company=self.company, created_by=user)

    def test_generates_csv(self):
        from apps.reports.tasks import generate_finance_report

        data = _done_entry(_run_report_task(generate_finance_report, self.company.id, "csv", {}))
        self.assertEqual(data["content_type"], "text/csv")
        content = data["content"].decode("utf-8-sig")
        self.assertIn("Descri", content)  # "Descrição" — avoids encoding edge cases
        rows = [l for l in content.splitlines() if l.strip()]
        self.assertEqual(len(rows), 4, "Header + 3 transaction rows expected")

    def test_generates_pdf(self):
        from apps.reports.tasks import generate_finance_report

        data = _done_entry(_run_report_task(generate_finance_report, self.company.id, "pdf", {}))
        self.assertEqual(data["content_type"], "application/pdf")
        self.assertTrue(data["content"].startswith(b"%PDF"))

    def test_finance_filters_by_date_range(self):
        from apps.reports.tasks import generate_finance_report

        data = _done_entry(
            _run_report_task(
                generate_finance_report,
                self.company.id, "csv",
                {"start_date": "2099-01-01", "end_date": "2099-12-31"},
            )
        )
        lines = [l for l in data["content"].decode("utf-8-sig").splitlines() if l.strip()]
        self.assertEqual(len(lines), 1, "Only header row expected when date range matches nothing")


class GenerateArticlesReportTaskTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        user = UserFactory(company=self.company)
        ArticleFactory.create_batch(4, company=self.company, author=user, status="published")

    def test_generates_csv(self):
        from apps.reports.tasks import generate_articles_report

        data = _done_entry(_run_report_task(generate_articles_report, self.company.id, "csv", {}))
        self.assertEqual(data["content_type"], "text/csv")
        content = data["content"].decode("utf-8-sig")
        self.assertIn("Título", content)
        rows = [l for l in content.splitlines() if l.strip()]
        self.assertEqual(len(rows), 5, "Header + 4 article rows expected")

    def test_generates_pdf(self):
        from apps.reports.tasks import generate_articles_report

        data = _done_entry(_run_report_task(generate_articles_report, self.company.id, "pdf", {}))
        self.assertEqual(data["content_type"], "application/pdf")
        self.assertTrue(data["content"].startswith(b"%PDF"))

    def test_csv_filters_by_status(self):
        from apps.reports.tasks import generate_articles_report

        # Create one draft article — factory above created "published" ones
        draft_user = UserFactory(company=self.company)
        ArticleFactory(company=self.company, author=draft_user, status="draft")

        data = _done_entry(
            _run_report_task(generate_articles_report, self.company.id, "csv", {"status": "draft"})
        )
        rows = [l for l in data["content"].decode("utf-8-sig").splitlines() if l.strip()]
        self.assertEqual(len(rows), 2, "Header + 1 draft article expected")


class GeneratePayrollReportTaskTest(APITestCase):
    def setUp(self):
        self.company = CompanyFactory()
        user = UserFactory(company=self.company)
        run = PayrollRunFactory(company=self.company, created_by=user)
        PayrollLineFactory.create_batch(3, company=self.company, payroll_run=run, user=user)

    def test_generates_csv(self):
        from apps.reports.tasks import generate_payroll_report

        data = _done_entry(_run_report_task(generate_payroll_report, self.company.id, "csv", {}))
        self.assertEqual(data["content_type"], "text/csv")
        content = data["content"].decode("utf-8-sig")
        self.assertIn("Funcionário", content)
        rows = [l for l in content.splitlines() if l.strip()]
        self.assertEqual(len(rows), 4, "Header + 3 payroll line rows expected")

    def test_generates_pdf(self):
        from apps.reports.tasks import generate_payroll_report

        data = _done_entry(_run_report_task(generate_payroll_report, self.company.id, "pdf", {}))
        self.assertEqual(data["content_type"], "application/pdf")
        self.assertTrue(data["content"].startswith(b"%PDF"))

    def test_csv_filters_by_status(self):
        from apps.reports.tasks import generate_payroll_report

        # Existing run has status="closed"; filter for "paid" should yield only header
        data = _done_entry(
            _run_report_task(generate_payroll_report, self.company.id, "csv", {"status": "paid"})
        )
        rows = [l for l in data["content"].decode("utf-8-sig").splitlines() if l.strip()]
        self.assertEqual(len(rows), 1, "Only header row expected when status filter matches nothing")

    def test_csv_filters_by_period_start(self):
        from apps.reports.tasks import generate_payroll_report

        data = _done_entry(
            _run_report_task(generate_payroll_report, self.company.id, "csv", {"period_start": "2099-01-01"})
        )
        rows = [l for l in data["content"].decode("utf-8-sig").splitlines() if l.strip()]
        self.assertEqual(len(rows), 1, "Only header row expected when future period_start matches nothing")
