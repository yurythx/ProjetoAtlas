"""
Atlas Load Test — Locust scenarios
====================================
Usage:
    pip install locust
    locust -f locustfile.py --host=http://localhost:8005

    # Headless (CI):
    locust -f locustfile.py --host=http://localhost:8005 \
           --users=50 --spawn-rate=5 --run-time=60s --headless

Environment variables (optional):
    ATLAS_COMPANY_SLUG  — company slug sent via X-Company-Slug header (default: "default")
    ATLAS_EMAIL         — test user email  (default: "admin@example.com")
    ATLAS_PASSWORD      — test user password (default: "admin")
"""
import os

from locust import HttpUser, TaskSet, between, task


COMPANY_SLUG = os.getenv("ATLAS_COMPANY_SLUG", "default")
TEST_EMAIL = os.getenv("ATLAS_EMAIL", "admin@example.com")
TEST_PASSWORD = os.getenv("ATLAS_PASSWORD", "admin")


class AuthMixin:
    """Handles JWT login and injects headers into every request."""

    access_token: str = ""

    def on_start(self):
        self.login()

    def login(self):
        resp = self.client.post(
            "/api/accounts/token/",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            headers={"X-Company-Slug": COMPANY_SLUG},
            name="/api/accounts/token/ [login]",
        )
        if resp.status_code == 200:
            self.access_token = resp.json()["access"]
        else:
            self.access_token = ""

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "X-Company-Slug": COMPANY_SLUG,
        }


# ---------------------------------------------------------------------------
# Task sets
# ---------------------------------------------------------------------------

class PublicTasks(TaskSet):
    """Unauthenticated endpoints — healthcheck and public portal."""

    @task(5)
    def health(self):
        self.client.get("/api/health/", name="/api/health/")

    @task(2)
    def public_articles(self):
        self.client.get(
            "/api/articles/?is_public=true",
            headers={"X-Company-Slug": COMPANY_SLUG},
            name="/api/articles/ [public]",
        )

    @task(1)
    def public_services(self):
        self.client.get(
            "/api/services/",
            headers={"X-Company-Slug": COMPANY_SLUG},
            name="/api/services/",
        )


class DashboardTasks(AuthMixin, TaskSet):
    """Authenticated — dashboard and read-heavy endpoints."""

    @task(8)
    def dashboard_stats(self):
        self.client.get(
            "/api/core/dashboard/stats/",
            headers=self._headers(),
            name="/api/core/dashboard/stats/",
        )

    @task(5)
    def notifications(self):
        self.client.get(
            "/api/notifications/?is_read=false",
            headers=self._headers(),
            name="/api/notifications/ [unread]",
        )

    @task(3)
    def articles_list(self):
        self.client.get(
            "/api/articles/",
            headers=self._headers(),
            name="/api/articles/ [auth]",
        )

    @task(2)
    def finance_transactions(self):
        self.client.get(
            "/api/finance/transactions/",
            headers=self._headers(),
            name="/api/finance/transactions/",
        )

    @task(2)
    def audit_logs(self):
        self.client.get(
            "/api/core/audit-logs/?page_size=20",
            headers=self._headers(),
            name="/api/core/audit-logs/",
        )

    @task(1)
    def refresh_token(self):
        """Simulate a client refreshing its access token."""
        resp = self.client.post(
            "/api/accounts/token/refresh/",
            headers={"X-Company-Slug": COMPANY_SLUG},
            name="/api/accounts/token/refresh/",
        )
        if resp.status_code == 200:
            self.access_token = resp.json().get("access", self.access_token)


class CRMTasks(AuthMixin, TaskSet):
    """CRM-heavy workload — pipelines, deals, search."""

    @task(6)
    def list_pipelines(self):
        self.client.get(
            "/api/crm/pipelines/",
            headers=self._headers(),
            name="/api/crm/pipelines/",
        )

    @task(4)
    def list_deals(self):
        self.client.get(
            "/api/crm/deals/?page_size=50",
            headers=self._headers(),
            name="/api/crm/deals/",
        )

    @task(3)
    def global_search(self):
        self.client.get(
            "/api/core/search/?q=incidente&page_size=10",
            headers=self._headers(),
            name="/api/core/search/",
        )

    @task(2)
    def crm_metrics(self):
        self.client.get(
            "/api/crm/metrics/",
            headers=self._headers(),
            name="/api/crm/metrics/",
        )

    @task(1)
    def automation_rules(self):
        self.client.get(
            "/api/crm/automation-rules/",
            headers=self._headers(),
            name="/api/crm/automation-rules/",
        )


# ---------------------------------------------------------------------------
# User classes
# ---------------------------------------------------------------------------

class PublicUser(HttpUser):
    """Simulates an unauthenticated visitor browsing the public portal."""
    tasks = [PublicTasks]
    wait_time = between(1, 3)
    weight = 10


class DashboardUser(HttpUser):
    """Simulates a logged-in user on the main dashboard."""
    tasks = [DashboardTasks]
    wait_time = between(2, 5)
    weight = 50


class CRMUser(HttpUser):
    """Simulates a power user working heavily in CRM."""
    tasks = [CRMTasks]
    wait_time = between(1, 4)
    weight = 30


class MessengerTasks(AuthMixin, TaskSet):
    """Messenger read workload — conversations and messages."""

    conversation_id: int | None = None

    @task(5)
    def list_conversations(self):
        resp = self.client.get(
            "/api/messenger/conversations/",
            headers=self._headers(),
            name="/api/messenger/conversations/",
        )
        if resp.status_code == 200:
            results = resp.json().get("results", resp.json())
            if results:
                self.conversation_id = results[0]["id"]

    @task(3)
    def list_messages(self):
        if not self.conversation_id:
            return
        self.client.get(
            f"/api/messenger/conversations/{self.conversation_id}/messages/",
            headers=self._headers(),
            name="/api/messenger/conversations/[id]/messages/",
        )

    @task(1)
    def list_modules(self):
        """Cache hit test — tenant module list (cached 1h)."""
        self.client.get(
            "/api/modules/my-modules/",
            headers={**self._headers(), "X-Company-Slug": COMPANY_SLUG},
            name="/api/modules/my-modules/ [cached]",
        )


class WriteTasksMixin(AuthMixin, TaskSet):
    """Write operations to simulate realistic mutation load."""

    @task(2)
    def mark_notification_read(self):
        """Marks any unread notification as read (optimistic in UI, confirmed here)."""
        resp = self.client.get(
            "/api/notifications/notifications/?is_read=false&page_size=1",
            headers=self._headers(),
            name="/api/notifications/ [pick one]",
        )
        if resp.status_code == 200:
            results = resp.json().get("results", resp.json())
            if results:
                nid = results[0]["id"]
                self.client.post(
                    f"/api/notifications/notifications/{nid}/mark_as_read/",
                    headers=self._headers(),
                    name="/api/notifications/[id]/mark_as_read/",
                )

    @task(1)
    def request_crm_report(self):
        """Triggers async CSV report generation for CRM."""
        resp = self.client.post(
            "/api/reports/crm/export/",
            json={"format": "csv"},
            headers=self._headers(),
            name="/api/reports/crm/export/",
        )
        if resp.status_code == 202:
            task_id = resp.json().get("task_id")
            if task_id:
                self.client.get(
                    f"/api/reports/tasks/{task_id}/",
                    headers=self._headers(),
                    name="/api/reports/tasks/[id]/ [status]",
                )

    @task(1)
    def company_current(self):
        """Cache hit test — company branding (cached 5 min)."""
        self.client.get(
            "/api/core/companies/current/",
            headers=self._headers(),
            name="/api/core/companies/current/ [cached]",
        )


class MixedUser(HttpUser):
    """Simulates a user alternating between dashboard and CRM."""
    tasks = {DashboardTasks: 3, CRMTasks: 2}
    wait_time = between(2, 6)
    weight = 10


class MessengerUser(HttpUser):
    """Simulates a user focused on messaging."""
    tasks = [MessengerTasks]
    wait_time = between(1, 3)
    weight = 15


class WriterUser(HttpUser):
    """Simulates a user performing write operations (notifications, reports)."""
    tasks = [WriteTasksMixin]
    wait_time = between(3, 8)
    weight = 5
