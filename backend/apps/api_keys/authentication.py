from rest_framework import authentication, exceptions

from .models import APIKey


class APIKeyAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        api_key_header = request.headers.get("X-API-Key")

        raw_api_key = None
        if api_key_header:
            raw_api_key = api_key_header
        else:
            auth_header = request.headers.get("Authorization") or ""
            if auth_header.startswith("Api-Key "):
                raw_api_key = auth_header.split(" ", 1)[1].strip()
            elif auth_header.startswith("X-API-Key "):
                raw_api_key = auth_header.split(" ", 1)[1].strip()

        if not raw_api_key:
            return None

        if "." not in raw_api_key:
            return None

        prefix, key = raw_api_key.split(".", 1)

        try:
            api_key_obj = APIKey.objects.get(prefix=prefix, is_active=True)
        except APIKey.DoesNotExist:
            raise exceptions.AuthenticationFailed("Chave de API inválida ou inativa.")

        if not api_key_obj.is_valid():
            raise exceptions.AuthenticationFailed("Esta chave de API expirou.")

        if not api_key_obj.verify_key(key):
            raise exceptions.AuthenticationFailed("Chave de API incorreta.")

        # Update usage metadata in background
        from .tasks import update_api_key_last_used

        update_api_key_last_used.delay(api_key_obj.id)

        # Set company in request for TenantMiddleware (if not already set)
        request.company = api_key_obj.company

        # Return a virtual user object and the auth object.
        from .models import APIKeyUser

        user = APIKeyUser(api_key_obj.company, name=api_key_obj.name)

        return (user, api_key_obj)
