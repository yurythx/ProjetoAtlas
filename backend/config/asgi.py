import os

import django
from channels.routing import ProtocolTypeRouter, URLRouter
from django.conf import settings
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from channels.security.websocket import AllowedHostsOriginValidator

import apps.messenger.routing
import apps.notifications.routing
from shared_kernel.channels_middleware import JwtAuthMiddleware

websocket_app = JwtAuthMiddleware(
    URLRouter(apps.messenger.routing.websocket_urlpatterns + apps.notifications.routing.websocket_urlpatterns)
)
if not settings.TESTING:
    websocket_app = AllowedHostsOriginValidator(websocket_app)

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": websocket_app,
    }
)
