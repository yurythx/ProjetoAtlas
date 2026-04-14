import logging
import threading
import uuid

_local = threading.local()


class ContextLoggerFilter(logging.Filter):
    """
    Injeta request_id, user_id e tenant (company_slug) em todos os logs
    que passarem por este filtro.
    """

    def filter(self, record):
        record.request_id = getattr(_local, "request_id", None)
        record.user_id = getattr(_local, "user_id", None)
        record.tenant = getattr(_local, "tenant", None)
        return True


logger = logging.getLogger("django.request")

# S8: Headers that must NEVER appear in logs in plain text.
_SENSITIVE_HEADERS = frozenset(
    [
        "authorization",
        "cookie",
        "x-api-key",
        "proxy-authorization",
    ]
)


def _sanitize_headers(headers: dict) -> dict:
    """
    Returns a copy of `headers` with sensitive values redacted.
    Preserves the auth scheme (e.g., 'Bearer') for diagnostics without leaking tokens.
    """
    safe = {}
    for key, value in headers.items():
        lower_key = key.lower()
        if lower_key in _SENSITIVE_HEADERS:
            if lower_key == "authorization" and " " in value:
                scheme = value.split(" ", 1)[0]  # e.g. "Bearer"
                safe[key] = f"{scheme} [REDACTED]"
            else:
                safe[key] = "[REDACTED]"
        else:
            safe[key] = value
    return safe


class StructuredLoggingMiddleware:
    """
    Middleware to add Request ID and user context to every log entry.
    Compatible with Sentry SDK v1 and v2.

    SECURITY: Authorization and Cookie headers are always redacted before logging.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Generate Request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.request_id = request_id

        # Add context to Sentry if SDK is installed
        company_slug = None
        user_id = None
        if hasattr(request, "company") and request.company:
            company_slug = request.company.slug
        if hasattr(request, "user") and getattr(request.user, "is_authenticated", False):
            user_id = request.user.id

        # Update thread-local context
        _local.request_id = request_id
        _local.user_id = user_id
        _local.tenant = company_slug

        try:
            import sentry_sdk

            sentry_sdk.set_tag("request_id", request_id)
            if company_slug:
                sentry_sdk.set_tag("company", company_slug)
            if user_id:
                sentry_sdk.set_user(
                    {
                        "id": user_id,
                        "username": request.user.username,
                    }
                )
        except Exception:
            pass

        try:
            response = self.get_response(request)
        finally:
            # Clear local context to avoid leakage between threads in pool
            _local.request_id = None
            _local.user_id = None
            _local.tenant = None

        # Expose request ID in response header
        response["X-Request-ID"] = request_id

        return response
