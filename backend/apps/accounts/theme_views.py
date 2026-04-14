from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import UserThemePreference
from .serializers import UserThemePreferenceSerializer


class UserThemePreferenceViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gerenciar preferências de tema do usuário.

    Endpoints:
    - GET /api/accounts/preferences/theme/current/ - Obtém preferências do usuário atual
    - PUT /api/accounts/preferences/theme/current/ - Atualiza preferências do usuário atual
    - POST /api/accounts/preferences/theme/reset/ - Restaura tema da empresa para o usuário atual
    """

    queryset = UserThemePreference.objects.all()
    serializer_class = UserThemePreferenceSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Obtém preferências de tema do usuário atual"""
        preferences, _created = UserThemePreference.objects.get_or_create(
            user=request.user, defaults={"use_tenant_theme": True, "dark_mode_preference": "system"}
        )

        serializer = self.get_serializer(preferences)
        return Response(serializer.data)

    @action(detail=False, methods=["put", "patch"])
    def update_current(self, request):
        """Atualiza preferências de tema do usuário atual"""
        preferences, _created = UserThemePreference.objects.get_or_create(
            user=request.user, defaults={"use_tenant_theme": True, "dark_mode_preference": "system"}
        )

        serializer = self.get_serializer(preferences, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"])
    def reset(self, request):
        """Restaura tema da empresa (limpa tema personalizado do usuário)"""
        preferences, _created = UserThemePreference.objects.get_or_create(user=request.user)

        preferences.use_tenant_theme = True
        preferences.theme_palette = None
        preferences.save()

        serializer = self.get_serializer(preferences)
        return Response(serializer.data)
