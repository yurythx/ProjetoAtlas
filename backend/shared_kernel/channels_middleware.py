import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from jwt import decode as jwt_decode
from jwt.exceptions import PyJWTError

logger = logging.getLogger(__name__)

User = get_user_model()


@database_sync_to_async
def get_user(validated_token):
    try:
        user_id = validated_token.get("user_id")
        if not user_id:
            return AnonymousUser()
        # Use all_objects to bypass tenant filter (context is empty in ASGI)
        # select_related('company') ensures we have the tenant context available in the consumer
        return User.all_objects.select_related("company").get(id=user_id)
    except (User.DoesNotExist, Exception) as e:
        logger.warning(f"[JwtAuthMiddleware] User {user_id} not found: {e}")
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        raw_qs = scope.get("query_string", b"")
        if raw_qs:
            query_string = raw_qs.decode("utf-8")
        else:
            path = scope.get("path", "")
            if isinstance(path, str) and "?" in path:
                path_only, qs = path.split("?", 1)
                scope["path"] = path_only
                query_string = qs
            else:
                query_string = ""

        query_params = parse_qs(query_string)
        token = query_params.get("token", [None])[0]

        if token:
            try:
                algorithm = settings.SIMPLE_JWT.get("ALGORITHM", "HS256")
                signing_key = settings.SIMPLE_JWT.get("SIGNING_KEY", settings.SECRET_KEY)
                decoded_data = jwt_decode(token, signing_key, algorithms=[algorithm])
                token_type = decoded_data.get("token_type")
                if token_type and token_type != "access":
                    scope["user"] = AnonymousUser()
                    return await super().__call__(scope, receive, send)

                # Get user from DB
                user = await get_user(decoded_data)
                scope["user"] = user

                if user.is_authenticated:
                    logger.debug(f"[JwtAuthMiddleware] Authenticated user: {user.username}")
                else:
                    logger.warning("[JwtAuthMiddleware] Token valid but user search returned AnonymousUser")

            except (PyJWTError, Exception) as e:
                # Token invalid
                logger.warning(f"[JwtAuthMiddleware] Authentication failed: {e!s}")
                scope["user"] = AnonymousUser()
        else:
            logger.debug("[JwtAuthMiddleware] No token provided in WebSocket connection")
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)
