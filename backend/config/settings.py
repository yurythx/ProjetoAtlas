import os
import sys
import warnings
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

env = environ.Env(DEBUG=(bool, False))

BASE_DIR = Path(__file__).resolve().parent.parent
environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

# SECURITY: SECRET_KEY is required and must be set via environment variable
# Generate with: python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
SECRET_KEY = env("SECRET_KEY")

if not SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY must be set in environment variables. "
        "Generate one with: python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'"
    )

DEBUG = env("DEBUG")
TESTING = (
    "test" in sys.argv
    or "test_coverage" in sys.argv
    or "--test" in sys.argv
    or "pytest" in sys.modules
    or os.environ.get("PYTEST_CURRENT_TEST") is not None
)

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    # Third party
    "rest_framework",
    "corsheaders",
    "channels",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",  # JWT Blacklist — required for secure logout
    "drf_spectacular",
    "reversion",  # Version control
    "storages",  # Django Storages
    "django_celery_beat",
    "django_filters",
    # Local apps
    "apps.core",
    "apps.accounts.apps.AccountsConfig",
    "apps.licensing",
    "apps.module_manager",
    "apps.pages",
    "apps.articles",
    "apps.messenger",
    "apps.media",
    "apps.notifications",
    "apps.seo",
    "apps.webhooks",
    "apps.api_keys",
    "apps.calendar",
    "apps.finance",
    "apps.payroll",
    "apps.crm",
    "apps.service_catalog",
    "apps.cmdb",
]

MIDDLEWARE = [
    "django.middleware.gzip.GZipMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # Whitenoise for static files
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "csp.middleware.CSPMiddleware",  # Content Security Policy
    "shared_kernel.middleware.TenantMiddleware",
    "shared_kernel.middleware.LicensingMiddleware",
    "shared_kernel.logging_middleware.StructuredLoggingMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "shared_kernel.middleware.TenantSecurityMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Authentication Backends (LDAP + Standard)
AUTHENTICATION_BACKENDS = [
    "apps.core.ldap_backend.TenantLDAPBackend",  # LDAP multi-tenant
    "django.contrib.auth.backends.ModelBackend",  # Fallback padrão
]

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.DefaultPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "shared_kernel.throttling.TenantRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "tenant": "5000/day",
        "anon": "500/day",
        # Scoped throttles
        "link_preview": "15/min",
        "public_articles": "60/min",
        "public_comments": "10/min",
        # SECURITY: Strict limit on user registration to prevent bot account creation
        "user_registration": "5/hour",
        "login_attempt": "10/minute",
        "password_reset": "3/hour",
    },
}

# Messenger
# Window to allow "delete for everyone" on messages (in seconds).
MESSENGER_DELETE_FOR_ALL_WINDOW_SECONDS = env.int("MESSENGER_DELETE_FOR_ALL_WINDOW_SECONDS", default=600)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),  # Mais curto por segurança
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),  # Longo para evitar deslogar no mobile frequentemente
    "ROTATE_REFRESH_TOKENS": True,  # Novo refresh token a cada renovação
    "BLACKLIST_AFTER_ROTATION": True,  # Invalida o antigo por segurança
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# Health check behavior in development
HEALTH_IGNORE_REDIS = env.bool("HEALTH_IGNORE_REDIS", default=False)
LICENSING_ENFORCE = env.bool("LICENSING_ENFORCE", default=False)
WEBHOOKS_ALLOW_PRIVATE_ENDPOINTS = env.bool("WEBHOOKS_ALLOW_PRIVATE_ENDPOINTS", default=False)



SPECTACULAR_SETTINGS = {
    "TITLE": "Atlas API",
    "DESCRIPTION": "API para Atlas ITIL v5 Suite",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "COMPONENT_NO_READ_ONLY_FIELDS": True,
    "CONTACT": {
        "name": "Atlas Team",
        "email": "support@projetoravenna.cloud",
    },
    "APPEND_COMPONENTS": {
        "securitySchemes": {
            "ApiKeyAuth": {
                "type": "apiKey",
                "in": "header",
                "name": "X-Company-Slug",
            }
        }
    },
    "SECURITY": [{"jwtAuth": []}, {"ApiKeyAuth": []}],
}

# CORS Configuration
# SECURITY: Always use explicit whitelist, never allow all origins
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "http://localhost:3000",
        "http://localhost:3005",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3005",
    ]
    if DEBUG
    else [],
)

if not DEBUG and not CORS_ALLOWED_ORIGINS:
    raise ImproperlyConfigured(
        "CORS_ALLOWED_ORIGINS must be set in production environment. Set the CORS_ALLOWED_ORIGINS environment variable."
    )

CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=[
        "https://projetoravenna.cloud",
        "https://api.projetoravenna.cloud",
        "http://192.168.1.121:3005",
        "http://192.168.1.121:8005",
        "http://192.168.29.69:3005",
        "http://192.168.29.69:8005",
        "http://localhost:3000",
        "http://localhost:3005",
        "http://localhost:8005",
        "http://127.0.0.1:3005",
        "http://127.0.0.1:8005",
    ],
)

# Trust X-Forwarded-Host from Cloudflare/Proxy
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

ALLOWED_HOSTS = env.list(
    "ALLOWED_HOSTS",
    default=[
        "api.projetoravenna.cloud",
        "projetoravenna.cloud",
        "atlas_backend",
        "atlas_frontend",
        "192.168.1.121",
        "192.168.29.69",
        "localhost",
        "127.0.0.1",
    ],
)

if TESTING and "testserver" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("testserver")

# SECURITY: Deployment security settings
if not DEBUG:
    # O Cloudflare Tunnel/Proxy já lida com HTTPS.
    # Ativamos True apenas se quisermos que o Django force o redirect,
    # mas isso pode quebrar healthchecks internos via HTTP.
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=False)
    SECURE_REDIRECT_EXEMPT = [
        r"^health/$",
        r"^api/core/health/$",
    ]
    SESSION_COOKIE_SECURE = env.bool("SESSION_COOKIE_SECURE", default=True)
    CSRF_COOKIE_SECURE = env.bool("CSRF_COOKIE_SECURE", default=True)
    SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=31536000)  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-company-slug",  # HTTP headers are case-insensitive; django-cors-headers normalises to lowercase
    "x-request-id",
]

# Allow credentials (cookies, Authorization headers) across origins
CORS_ALLOW_CREDENTIALS = True

# Native App schemes (Future-proofing for Capacitor/React Native)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^app://.*$",
    r"^capacitor://.*$",
    r"^http://localhost(:[0-9]+)?$",
]

# Expose these response headers to the browser (needed by frontend to read them)
CORS_EXPOSE_HEADERS = [
    "x-request-id",
    "content-disposition",
    "x-company-slug",
]

# DEV: Allow all origins to avoid CORS issues locally
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True


# Static & Media Files
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
if not DEBUG:
    STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
    # Long-term caching (1 year) for static assets with unique hashes
    WHITENOISE_MAX_AGE = 31536000

# MinIO / S3 Configuration
USE_S3 = env.bool("USE_S3", default=False)

if USE_S3:
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="minioadmin")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="minioadmin")
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="atlas-media")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="http://minio:9000")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default="us-east-1")
    AWS_S3_SIGNATURE_VERSION = "s3v4"

    # Media files on S3
    AWS_MEDIA_LOCATION = ""

    # Modern Django 4.2+ STORAGES setting
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
            "OPTIONS": {
                "location": AWS_MEDIA_LOCATION,
            },
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if not DEBUG
            else "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }

    # Backward compatibility (removed - using STORAGES)

    # Configuração de Domínio e URLs (Proxy ou Direto)
    media_host = env("MEDIA_HOST", default=None)
    if not media_host:
        if DEBUG:
            media_host = "localhost:8005"
        else:
            media_host = ALLOWED_HOSTS[0] if ALLOWED_HOSTS else "localhost"

    media_base_path = env("MEDIA_BASE_PATH", default="media")
    AWS_S3_CUSTOM_DOMAIN = f"{media_host}/{media_base_path}".rstrip("/")

    AWS_QUERYSTRING_AUTH = False

    media_proto = "http" if DEBUG else "https"
    MEDIA_URL = f"{media_proto}://{AWS_S3_CUSTOM_DOMAIN}/"
else:
    MEDIA_URL = "/media/"
    MEDIA_ROOT = BASE_DIR / "media"
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if not DEBUG
            else "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }


# Email Configuration
EMAIL_BACKEND = env.str("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env.str("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=1025)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=False)
EMAIL_HOST_USER = env.str("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env.str("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = env.str("DEFAULT_FROM_EMAIL", default="Atlas <noreply@projetoravenna.cloud>")
SERVER_EMAIL = DEFAULT_FROM_EMAIL
FRONTEND_URL = env.str("FRONTEND_URL", default="http://localhost:3005")

# Channels
ASGI_APPLICATION = "config.asgi.application"

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
}
# Forcing CONN_MAX_AGE=0 by default in Daphne/ASGI to prevent "too many clients"
# Postgres errors. Connections will close after each request unless overridden.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=0)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

# Redis Channel Layer & Cache
# Using logical DBs: 0 for Cache, 1 for Celery, 2 for Channels
REDIS_URL = env("REDIS_URL", default="redis://localhost:6379")

if REDIS_URL:
    # D4: Parse REDIS_URL robustly using urllib instead of fragile regex.
    # Strips any DB number suffix so we can assign logical DBs explicitly below.
    from urllib.parse import urlparse as _urlparse

    _parsed = _urlparse(REDIS_URL)
    # Reconstruct base URL: scheme + auth (if any) + host + port (without path/db)
    _auth = ""
    if _parsed.username or _parsed.password:
        _user = _parsed.username if _parsed.username else ""
        _pass = f":{_parsed.password}" if _parsed.password else ""
        _auth = f"{_user}{_pass}@"
    _port = f":{_parsed.port}" if _parsed.port else ""
    REDIS_BASE = f"{_parsed.scheme}://{_auth}{_parsed.hostname}{_port}"

    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [f"{REDIS_BASE}/2"],
            },
        },
    }

    # Redis Cache Configuration
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": f"{REDIS_BASE}/0",
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "KEY_FUNCTION": "shared_kernel.utils.make_key_with_tenant",
            },
        },
        "tenants": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": f"{REDIS_BASE}/0",
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        },
    }

    # In test mode, override Redis cache with in-memory cache
    # This allows running tests locally without a Redis server.
    # The CI pipeline has Redis via service container, so this only affects local dev.
    if TESTING:
        CACHES = {
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": "test-default",
            },
            "tenants": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": "test-tenants",
            },
        }
        # Also use in-memory channel layer in tests (no Redis needed)
        CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}


else:
    CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
    # Local memory cache for dev
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "unique-snowflake",
        },
        "tenants": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "tenants-cache",
        },
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Password reset link timeout (in seconds). Default is 3 days, let's reduce to 1 hour for security.
PASSWORD_RESET_TIMEOUT = 3600

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

# Logging Configuration
# Logging Configuration
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
        "simple": {
            "format": "{levelname} {message}",
            "style": "{",
        },
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(levelname)s %(asctime)s %(module)s %(message)s %(request_id)s %(user_id)s %(tenant)s",
        },
    },
    "filters": {
        "context": {
            "()": "shared_kernel.logging_middleware.ContextLoggerFilter",
        }
    },
    "handlers": {
        "console": {
            "level": "INFO",
            "class": "logging.StreamHandler",
            "formatter": "json" if not DEBUG else "verbose",
            "filters": ["context"],
        },
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

# Web Push (VAPID) Settings
# Generate keys with: pywebpush generate-vapid-keys
VAPID_PUBLIC_KEY = env("VAPID_PUBLIC_KEY", default=None)
VAPID_PRIVATE_KEY = env("VAPID_PRIVATE_KEY", default=None)
VAPID_ADMIN_EMAIL = env("VAPID_ADMIN_EMAIL", default="admin@projetoravenna.cloud")

# Warn if VAPID keys are missing in production (web push will silently fail without them)
if not DEBUG and not TESTING and not VAPID_PUBLIC_KEY:
    warnings.warn(
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set. "
        "Web push notifications will be disabled. "
        "Generate keys with: pywebpush generate-vapid-keys",
        UserWarning,
        stacklevel=2,
    )

# AI Settings
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
OPENAI_API_KEY = env("OPENAI_API_KEY", default="")
# Sentry Configuration
SENTRY_DSN = env("SENTRY_DSN", default=None)
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.redis import RedisIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[
            DjangoIntegration(),
            RedisIntegration(),
            CeleryIntegration(),
        ],
        traces_sample_rate=0.1,
        # SECURITY: send_default_pii=False — LGPD/GDPR compliance.
        # Sentry will NOT automatically attach user IPs, email or usernames.
        # User context is added manually via StructuredLoggingMiddleware (id + username only).
        send_default_pii=False,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
    )

# Celery Configuration
# Use DB 1 for Celery
CELERY_BROKER_URL = f"{REDIS_BASE}/1" if REDIS_URL else "redis://localhost:6379/1"
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_ACCEPT_CONTENT = ["application/json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
# IMPORTANT: CELERY_TASK_ALWAYS_EAGER must be driven by TESTING flag, NOT DEBUG.
# Running eager in dev (DEBUG=True) masks serialization and timing bugs that
# only surface in production with a real Celery worker.
# Override with CELERY_TASK_ALWAYS_EAGER=True in .env only when intentionally testing tasks.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=TESTING)
CELERY_TASK_EAGER_PROPAGATES = env.bool("CELERY_TASK_EAGER_PROPAGATES", default=TESTING)
CELERY_TASK_IGNORE_RESULT = True

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    "cleanup-orphan-messenger-files": {
        "task": "apps.messenger.tasks.cleanup_orphan_chat_files",
        "schedule": timedelta(days=1),
    },
    "payroll-accrue-thirteenth-previous-month": {
        "task": "apps.payroll.tasks.accrue_thirteenth_previous_month",
        "schedule": crontab(minute=5, hour=0, day_of_month="1"),
    },
    "payroll-generate-thirteenth-july": {
        "task": "apps.payroll.tasks.generate_thirteenth_july",
        "schedule": crontab(minute=15, hour=0, day_of_month="1", month_of_year="7"),
    },
    "payroll-generate-thirteenth-december": {
        "task": "apps.payroll.tasks.generate_thirteenth_december",
        "schedule": crontab(minute=25, hour=0, day_of_month="1", month_of_year="12"),
    },
}

# Field Encryption (for sensitive data like SMTP passwords)
# Generate key with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
FIELD_ENCRYPTION_KEY = env("FIELD_ENCRYPTION_KEY", default=None)

# SECURITY: In production, encryption key is mandatory.
# Without it, SMTP and LDAP passwords are stored as empty bytes (silently unprotected).
# BUILDING=True is set by the Dockerfile during collectstatic — secrets are never available at build time.
BUILDING = env.bool("BUILDING", default=False)
if not DEBUG and not TESTING and not BUILDING and not FIELD_ENCRYPTION_KEY:
    raise ImproperlyConfigured(
        "FIELD_ENCRYPTION_KEY must be set in production. "
        'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
    )

# Content Security Policy (CSP)
from .csp_config import *


