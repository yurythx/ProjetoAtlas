from django.conf import settings

# Content Security Policy (CSP) Configuration
# Protects against XSS, clickjacking, and other code injection attacks
# Reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP

# Default source for all directives (fallback)
CSP_DEFAULT_SRC = ("'self'",)

# Scripts: Allow self, inline (needed for Django admin), eval (needed for some React dev tools)
# In production, consider removing 'unsafe-inline' and 'unsafe-eval'
if settings.DEBUG:
    CSP_SCRIPT_SRC = ("'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net")
else:
    # Production: stricter policy
    CSP_SCRIPT_SRC = ("'self'", "https://cdn.jsdelivr.net")

# Styles: Allow self and inline styles (needed for many UI libraries)
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'", "https://fonts.googleapis.com")

# Images: Allow self, data URIs, and blob URIs
CSP_IMG_SRC = ("'self'", "data:", "blob:", "https:")

# Fonts: Allow self and Google Fonts
CSP_FONT_SRC = ("'self'", "data:", "https://fonts.gstatic.com")

# AJAX/WebSocket: Allow self
CSP_CONNECT_SRC = ("'self'", "ws:", "wss:")

# Media (audio/video): Allow self
CSP_MEDIA_SRC = ("'self'",)

# Object/Embed: Disallow (no Flash, etc)
CSP_OBJECT_SRC = ("'none'",)

# Base URI: Restrict to self
CSP_BASE_URI = ("'self'",)

# Forms: Can only be submitted to self
CSP_FORM_ACTION = ("'self'",)

# Frame ancestors: Prevent clickjacking
CSP_FRAME_ANCESTORS = ("'none'",)

# Upgrade insecure requests (HTTP -> HTTPS) in production
if not settings.DEBUG:
    CSP_UPGRADE_INSECURE_REQUESTS = True

# Report CSP violations (optional, configure when you have endpoint)
# CSP_REPORT_URI = env("CSP_REPORT_URI", default=None)

# Include directives in report-only mode for testing
CSP_REPORT_ONLY = settings.DEBUG  # Report violations in dev, enforce in production
