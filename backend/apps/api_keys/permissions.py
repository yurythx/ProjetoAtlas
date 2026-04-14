from rest_framework import permissions


class HasAPIKeyScopes(permissions.BasePermission):
    def has_permission(self, request, view):
        required_scopes = getattr(view, "required_api_key_scopes", None)
        if not required_scopes:
            return True

        auth = getattr(request, "auth", None)
        scopes = getattr(auth, "scopes", None)
        if scopes is None:
            return True

        required = set(required_scopes)
        granted = set(scopes or [])
        return required.issubset(granted)

