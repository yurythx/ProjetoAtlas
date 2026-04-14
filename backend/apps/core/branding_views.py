from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared_kernel.cache import invalidate_tenant_cache, tenant_cached
from shared_kernel.tenant_context import get_current_company

from .models import TenantBranding
from .serializers import TenantBrandingSerializer


class TenantBrandingViewSet(viewsets.ModelViewSet):
    """
    ViewSet para gerenciar branding da empresa (tenant).

    Endpoints:
    - GET /api/core/branding/ - Lista todas as configurações de branding (admin)
    - GET /api/core/branding/current/ - Obtém branding do tenant atual
    - PUT /api/core/branding/current/ - Atualiza branding do tenant atual (admin)
    - POST /api/core/branding/upload-logo/ - Upload de logo
    - POST /api/core/branding/upload-icon/ - Upload de ícone
    - GET /api/core/branding/palettes/ - Lista paletas disponíveis
    """

    queryset = TenantBranding.objects.all()
    serializer_class = TenantBrandingSerializer

    @tenant_cached(timeout=3600, key_prefix="branding")
    @action(
        detail=False,
        methods=["get"],
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
        throttle_classes=[],
    )
    def current(self, request):
        """Obtém branding do tenant atual (público para carregar tema no login)"""
        return self._get_current_branding()

    @tenant_cached(timeout=3600, key_prefix="branding_public")
    @action(
        detail=False,
        methods=["get"],
        permission_classes=[permissions.AllowAny],
        authentication_classes=[],
        throttle_classes=[],
    )
    def public_current(self, request):
        """Obtém branding do tenant atual (público)"""
        return self._get_current_branding()

    def _get_current_branding(self):
        try:
            company = get_current_company()
            if not company:
                # Fallback para branding do sistema (se não houver tenant identificado)
                return Response(
                    {
                        "company_name": "Atlas SaaS",
                        "primary_color": "#000000",
                        "secondary_color": "#ffffff",
                        "logo": None,
                        "icon": None,
                        "theme_palette": "slate-gray",
                    }
                )

            branding, _created = TenantBranding.objects.get_or_create(
                company=company, defaults={"company_name": company.name, "theme_palette": "django-green"}
            )

            serializer = self.get_serializer(branding)
            return Response(serializer.data)
        except Exception:
            # Fallback seguro em caso de erro 500 no get_current_company ou get_or_create
            return Response(
                {
                    "company_name": "Atlas SaaS",
                    "primary_color": "#000000",
                    "secondary_color": "#ffffff",
                    "logo": None,
                    "icon": None,
                    "theme_palette": "slate-gray",
                }
            )

    def get_authenticators(self):
        """Desativa autenticação para endpoints públicos para evitar 401 com tokens expirados"""
        path = getattr(getattr(self, "request", None), "path", "") or ""
        if path.startswith("/api/core/branding/") and (
            path.endswith("/current/") or path.endswith("/public_current/") or path.endswith("/palettes/")
        ):
            return []
        return super().get_authenticators()

    def get_permissions(self):
        path = getattr(getattr(self, "request", None), "path", "") or ""
        if path.startswith("/api/core/branding/") and (
            path.endswith("/current/") or path.endswith("/public_current/") or path.endswith("/palettes/")
        ):
            return [permissions.AllowAny()]
        return [IsAuthenticated()]

    @action(detail=False, methods=["put"])
    def update_current(self, request):
        """Atualiza branding do tenant atual (apenas admins)"""
        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        allowed = request.user.is_superuser or request.user.is_staff or (isinstance(perms, list) and ("*" in perms or "admin.settings_manage" in perms))
        if not allowed:
            return Response({"error": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        company = get_current_company()
        if not company:
            return Response({"error": "No company context found"}, status=status.HTTP_400_BAD_REQUEST)

        branding, _created = TenantBranding.objects.get_or_create(
            company=company, defaults={"company_name": company.name}
        )

        serializer = self.get_serializer(branding, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # Invalida o cache ao atualizar
            invalidate_tenant_cache("branding", company.slug)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"], url_path="upload-logo")
    def upload_logo(self, request):
        """Upload de logo da empresa"""
        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        allowed = request.user.is_superuser or request.user.is_staff or (isinstance(perms, list) and ("*" in perms or "admin.settings_manage" in perms))
        if not allowed:
            return Response({"error": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        company = get_current_company()
        if not company:
            return Response({"error": "No company context found"}, status=status.HTTP_400_BAD_REQUEST)

        branding, _created = TenantBranding.objects.get_or_create(
            company=company, defaults={"company_name": company.name}
        )

        if "logo" not in request.FILES:
            return Response({"error": "No logo file provided"}, status=status.HTTP_400_BAD_REQUEST)

        branding.logo = request.FILES["logo"]
        branding.save()

        # Invalida o cache ao fazer upload
        invalidate_tenant_cache("branding", company.slug)

        serializer = self.get_serializer(branding)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="upload-icon")
    def upload_icon(self, request):
        """Upload de ícone/favicon da empresa"""
        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        allowed = request.user.is_superuser or request.user.is_staff or (isinstance(perms, list) and ("*" in perms or "admin.settings_manage" in perms))
        if not allowed:
            return Response({"error": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        company = get_current_company()
        if not company:
            return Response({"error": "No company context found"}, status=status.HTTP_400_BAD_REQUEST)

        branding, _created = TenantBranding.objects.get_or_create(
            company=company, defaults={"company_name": company.name}
        )

        if "icon" not in request.FILES:
            return Response({"error": "No icon file provided"}, status=status.HTTP_400_BAD_REQUEST)

        branding.icon = request.FILES["icon"]
        branding.save()

        # Invalida o cache ao fazer upload
        invalidate_tenant_cache("branding", company.slug)

        serializer = self.get_serializer(branding)
        return Response(serializer.data)

    @action(detail=False, methods=["get", "put"])
    def email_config(self, request):
        """Gerencia configurações de SMTP do tenant atual"""
        if request.method == "PUT":
            role = getattr(request.user, "role", None)
            perms = getattr(role, "permissions", None)
            allowed = request.user.is_superuser or request.user.is_staff or (isinstance(perms, list) and ("*" in perms or "admin.settings_manage" in perms))
            if not allowed:
                return Response({"error": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        company = get_current_company()
        from .models import TenantEmailConfig
        from .serializers import TenantEmailConfigSerializer

        config, _created = TenantEmailConfig.objects.get_or_create(company=company)

        if request.method == "PUT":
            serializer = TenantEmailConfigSerializer(config, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer = TenantEmailConfigSerializer(config)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def test_smtp(self, request):
        """Testa as configurações de SMTP enviando um e-mail de teste"""
        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        allowed = request.user.is_superuser or request.user.is_staff or (isinstance(perms, list) and ("*" in perms or "admin.settings_manage" in perms))
        if not allowed:
            return Response({"error": "Permissão negada."}, status=status.HTTP_403_FORBIDDEN)

        company = get_current_company()
        from .models import TenantEmailConfig

        config = get_object_or_404(TenantEmailConfig, company=company)

        if not config.use_custom_smtp or not config.smtp_host:
            return Response({"error": "Custom SMTP is not configured or enabled"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from django.core.mail import EmailMessage, get_connection

            connection = get_connection(
                host=config.smtp_host,
                port=config.smtp_port,
                username=config.smtp_user,
                password=config.get_smtp_password(),
                use_tls=config.smtp_use_tls,
            )

            email = EmailMessage(
                subject=f"Teste de SMTP - {company.name}",
                body="Se você recebeu este e-mail, as configurações de SMTP do seu tenant estão funcionando corretamente!",
                from_email=config.from_email or settings.DEFAULT_FROM_EMAIL,
                to=[request.user.email],
                connection=connection,
            )
            email.send()
            return Response({"message": "E-mail de teste enviado com sucesso!"})
        except Exception:
            return Response({"error": "Falha ao enviar e-mail. Verifique host, porta e credenciais."}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"], permission_classes=[permissions.AllowAny], authentication_classes=[])
    def palettes(self, request):
        """Lista paletas de cores disponíveis"""
        palettes = [
            {
                "code": "django-green",
                "name": "Django Green",
                "primary_color": "#0C4B33",
                "description": "Paleta clássica do Django",
            },
            {
                "code": "ocean-blue",
                "name": "Ocean Blue",
                "primary_color": "#0369A1",
                "description": "Azul mar profundo",
            },
            {
                "code": "royal-purple",
                "name": "Royal Purple",
                "primary_color": "#7C3AED",
                "description": "Roxo real vibrante",
            },
            {
                "code": "sunset-orange",
                "name": "Sunset Orange",
                "primary_color": "#EA580C",
                "description": "Laranja pôr do sol",
            },
            {
                "code": "forest-green",
                "name": "Forest Green",
                "primary_color": "#166534",
                "description": "Verde floresta",
            },
            {
                "code": "slate-gray",
                "name": "Slate Gray",
                "primary_color": "#475569",
                "description": "Cinza ardósia moderno",
            },
        ]
        return Response(palettes)
