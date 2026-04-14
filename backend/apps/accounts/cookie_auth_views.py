"""
F1 — httpOnly Cookie Auth Views.

These views provide an alternative authentication flow where JWT tokens are stored
in httpOnly, Secure, SameSite=Lax cookies instead of localStorage.

Benefits:
- httpOnly: JavaScript cannot access the token (XSS protection)
- Secure: only sent over HTTPS
- SameSite=Lax: CSRF protection for top-level navigations

Frontend migration path:
1. POST to /api/accounts/token/cookie/ instead of /api/accounts/token/
2. On success, tokens are set in cookies automatically — no localStorage needed
3. For subsequent requests, include credentials: 'include' in fetch / withCredentials: true in axios
4. Refresh via POST to /api/accounts/token/cookie/refresh/ (reads cookie automatically)
5. Logout via POST to /api/accounts/logout/cookie/ (clears cookies server-side)

The existing localStorage-based flow continues to work in parallel during migration.
"""

import logging

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError

logger = logging.getLogger(__name__)

# Cookie names
ACCESS_COOKIE_NAME = "atlas_access"
REFRESH_COOKIE_NAME = "atlas_refresh"

# Cookie settings
_COOKIE_SECURE = not getattr(settings, "DEBUG", False)  # False in dev, True in prod
_COOKIE_SAMESITE = "Lax"
_COOKIE_HTTPONLY = True
_ACCESS_MAX_AGE = 60 * 60  # 1 hour (matches SIMPLE_JWT ACCESS_TOKEN_LIFETIME)
_REFRESH_MAX_AGE = 60 * 60 * 24 * 7  # 7 days (matches SIMPLE_JWT REFRESH_TOKEN_LIFETIME)


def _set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """Set httpOnly auth cookies on a response object."""
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        str(access_token),
        max_age=_ACCESS_MAX_AGE,
        httponly=_COOKIE_HTTPONLY,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        str(refresh_token),
        max_age=_REFRESH_MAX_AGE,
        httponly=_COOKIE_HTTPONLY,
        secure=_COOKIE_SECURE,
        samesite=_COOKIE_SAMESITE,
        path="/api/accounts/token/cookie/",  # Restrict refresh cookie to refresh endpoint
    )


def _clear_auth_cookies(response) -> None:
    """Clear auth cookies (used on logout)."""
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/accounts/token/cookie/")


@extend_schema(
    tags=["Accounts - Auth"],
    summary="Login and receive tokens as httpOnly cookies (XSS-safe)",
    description=(
        "Alternative to POST /token/ that stores JWT tokens in httpOnly cookies "
        "instead of returning them in the response body. Requires credentials: 'include' "
        "on subsequent requests."
    ),
)
class CookieTokenObtainView(generics.GenericAPIView):
    """
    POST /api/accounts/token/cookie/
    Body: { "username": "...", "password": "..." }
    Sets httpOnly cookies: atlas_access, atlas_refresh
    Returns: { "detail": "Login successful." }
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    from rest_framework.throttling import ScopedRateThrottle
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login_attempt'

    def post(self, request):
        from .serializers import CustomTokenObtainPairSerializer

        serializer = CustomTokenObtainPairSerializer(
            data=request.data,
            context={"request": request},
        )

        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return Response(
                {"detail": "Credenciais inválidas."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        access = serializer.validated_data.get("access")
        refresh = serializer.validated_data.get("refresh")

        response = Response(
            {"detail": "Login realizado com sucesso."},
            status=status.HTTP_200_OK,
        )
        _set_auth_cookies(response, access, refresh)
        return response


@extend_schema(
    tags=["Accounts - Auth"],
    summary="Refresh access token via httpOnly cookie",
)
class CookieTokenRefreshView(generics.GenericAPIView):
    """
    POST /api/accounts/token/cookie/refresh/
    Reads atlas_refresh cookie, issues new access token cookie.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        from django.contrib.auth import get_user_model
        from rest_framework_simplejwt.tokens import RefreshToken

        from .serializers import CustomTokenObtainPairSerializer

        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if not refresh_token:
            return Response(
                {"detail": "Refresh token não encontrado nos cookies."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        User = get_user_model()
        try:
            token = RefreshToken(refresh_token)
            user_id = token.get("user_id")
            user = User.all_objects.get(id=user_id)
            new_token = CustomTokenObtainPairSerializer.get_token(user)
            access = str(new_token.access_token)
        except (TokenError, User.DoesNotExist) as e:
            logger.warning("Cookie token refresh failed: %s", str(e))
            response = Response(
                {"detail": "Sessão expirada. Faça login novamente."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_auth_cookies(response)
            return response

        response = Response({"detail": "Token renovado."}, status=status.HTTP_200_OK)
        # Only refresh the access cookie; refresh cookie stays the same
        response.set_cookie(
            ACCESS_COOKIE_NAME,
            access,
            max_age=_ACCESS_MAX_AGE,
            httponly=_COOKIE_HTTPONLY,
            secure=_COOKIE_SECURE,
            samesite=_COOKIE_SAMESITE,
            path="/",
        )
        return response


@extend_schema(
    tags=["Accounts - Auth"],
    summary="Logout and clear httpOnly cookies",
)
class CookieLogoutView(generics.GenericAPIView):
    """
    POST /api/accounts/logout/cookie/
    Blacklists the refresh token from cookie and clears both cookies.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh_token = request.COOKIES.get(REFRESH_COOKIE_NAME)
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                pass  # Already blacklisted or expired — treat as success

        response = Response({"detail": "Logout realizado com sucesso."}, status=status.HTTP_200_OK)
        _clear_auth_cookies(response)
        return response
