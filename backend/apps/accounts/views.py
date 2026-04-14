from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

from shared_kernel.audit import log_action

from .models import Invitation, Role
from .serializers import (
    AcceptInvitationSerializer,
    CustomTokenObtainPairSerializer,
    InvitationSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RoleSerializer,
    UserRegistrationSerializer,
    UserSerializer,
)
from .services import AccountService

User = get_user_model()


@extend_schema(tags=["Accounts - Auth"])
class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    from rest_framework.throttling import ScopedRateThrottle
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login_attempt'


@extend_schema(tags=["Accounts - Auth"], summary="Logout and invalidate refresh token")
class LogoutView(generics.GenericAPIView):
    """
    POST /api/accounts/logout/
    Blacklists the provided refresh token so it can no longer be used
    to generate new access tokens. The current access token remains valid
    until it expires (up to 60 min), but cannot be refreshed.
    """

    permission_classes = [permissions.IsAuthenticated]

    class LogoutSerializer(serializers.Serializer):
        refresh = serializers.CharField()

    serializer_class = LogoutSerializer

    def post(self, request):
        from rest_framework_simplejwt.exceptions import TokenError
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response({"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            # Token already blacklisted or invalid — treat as success (idempotent logout)
            pass
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Logout failed unexpectedly: {e}")
            return Response({"detail": "Erro interno ao processar logout."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"detail": "Logout successful."}, status=status.HTTP_200_OK)


@extend_schema(tags=["Accounts - Auth"], summary="Refresh access token")
class CustomTokenRefreshView(generics.GenericAPIView):
    """
    Custom token refresh view that works with multi-tenancy.
    Generates new access token with all custom claims from the user.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # Disable authentication for this endpoint

    def post(self, request):
        from rest_framework_simplejwt.exceptions import TokenError
        from rest_framework_simplejwt.tokens import RefreshToken

        from .serializers import CustomTokenObtainPairSerializer

        refresh_token = request.data.get("refresh")

        if not refresh_token:
            return Response({"detail": "Refresh token is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Validate the refresh token
            token = RefreshToken(refresh_token)

            # Get user_id from the refresh token
            user_id = token.get("user_id")

            if not user_id:
                return Response({"detail": "Invalid refresh token - no user_id"}, status=status.HTTP_401_UNAUTHORIZED)

            # Get the user definitively (using global manager)
            try:
                user = User.all_objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({"detail": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)

            # Generate new token pair with custom claims using the same serializer as login
            new_token = CustomTokenObtainPairSerializer.get_token(user)

            return Response(
                {
                    "access": str(new_token.access_token),
                    "refresh": str(token),  # Return the same refresh token
                },
                status=status.HTTP_200_OK,
            )

        except TokenError:
            return Response({"detail": "Invalid or expired refresh token"}, status=status.HTTP_401_UNAUTHORIZED)


@extend_schema(tags=["Accounts - Auth"], summary="Register a new user (admin level)")
class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    # SECURITY: Strict rate limit to prevent bot account creation (5 registrations/hour per IP).
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "user_registration"


@extend_schema(tags=["Accounts - Auth"], summary="Request password reset link")
class PasswordResetRequestView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetRequestSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AccountService.request_password_reset(serializer.validated_data["email"])

        return Response(
            {"detail": "Se o seu email estiver cadastrado, você receberá um link de recuperação."},
            status=status.HTTP_200_OK,
        )


@extend_schema(tags=["Accounts - Auth"], summary="Confirm password reset with token")
class PasswordResetConfirmView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = PasswordResetConfirmSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        success = AccountService.confirm_password_reset(
            uid=serializer.validated_data["uid"],
            token=serializer.validated_data["token"],
            new_password=serializer.validated_data["new_password"],
        )

        if success:
            return Response({"detail": "Senha alterada com sucesso."}, status=status.HTTP_200_OK)
        return Response({"detail": "Link inválido ou expirado."}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema_view(
    list=extend_schema(tags=["Accounts - Users"]),
    retrieve=extend_schema(tags=["Accounts - Users"]),
    create=extend_schema(tags=["Accounts - Users"]),
    update=extend_schema(tags=["Accounts - Users"]),
    partial_update=extend_schema(tags=["Accounts - Users"]),
    destroy=extend_schema(tags=["Accounts - Users"]),
    me=extend_schema(tags=["Accounts - Users"], summary="Get current user profile"),
    export=extend_schema(tags=["Accounts - Users"], summary="Export users as CSV"),
)
class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    required_permission = "admin.user_manage"
    # A1: Feature limit check moved to permission class (runs before body parse, returns 403)
    feature_limit_code = "max_users"
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["username", "email", "first_name", "last_name", "date_joined"]

    def get_permissions(self):
        from .permissions import FeatureLimitPermission, HasRolePermission

        if self.action in ("me", "retrieve"):
            return [permissions.IsAuthenticated()]
        if self.action == "create":
            return [permissions.IsAuthenticated(), HasRolePermission(), FeatureLimitPermission()]
        return [permissions.IsAuthenticated(), HasRolePermission()]

    def get_queryset(self):
        # Se for superusuário, vê todos os usuários de todas as empresas
        if self.request.user.is_superuser:
            qs = User.all_objects.select_related("role", "company").all().order_by("username")
            # Permite filtrar por empresa via query param para superusuarios
            company_slug = self.request.query_params.get("company_slug")
            if company_slug:
                qs = qs.filter(company__slug=company_slug)
        else:
            # Regular tenant users use standard objects (which already filters by tenant)
            qs = User.objects.select_related("role", "company").all().order_by("username")

        role_id = self.request.query_params.get("role")
        q = self.request.query_params.get("q")
        active = self.request.query_params.get("active")

        if role_id:
            qs = qs.filter(role_id=role_id)
        if q:
            from django.db.models import Q

            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
            )
        if active is not None:
            normalized = str(active).strip().lower()
            if normalized in {"1", "true", "yes", "y"}:
                qs = qs.filter(is_active=True)
            elif normalized in {"0", "false", "no", "n"}:
                qs = qs.filter(is_active=False)

        return qs

    def create(self, request, *args, **kwargs):
        # Override to provide better validation feedback
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        import logging

        logger = logging.getLogger(__name__)

        # Determine company — superuser can specify explicitly; others use request context
        if self.request.user.is_superuser and "company" in serializer.validated_data:
            company = serializer.validated_data["company"]
        else:
            company = getattr(self.request, "company", None)

        if not company:
            logger.error("USER CREATION FAILED: No company in request context")
            from rest_framework.exceptions import ValidationError

            raise ValidationError("Empresa não identificada no contexto.")

        # A1: Feature limit check is now handled by FeatureLimitPermission in get_permissions().
        # perform_create() no longer needs to call check_feature_limit() directly.
        serializer.save(company=company)
        logger.info("USER CREATED SUCCESSFULLY for company %s", company.slug)

    def perform_update(self, serializer):
        target_user = self.get_object()
        # A6: Segurança - Apenas superusuários podem editar outros superusuários
        if target_user.is_superuser and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Somente um superusuário pode editar outro superusuário.")
        serializer.save()

    def perform_destroy(self, instance):
        # A6: Segurança - Apenas superusuários podem remover outros superusuários
        if instance.is_superuser and not self.request.user.is_superuser:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Somente um superusuário pode remover outro superusuário.")
        instance.delete()

    @action(detail=False, methods=["get", "put", "patch"])
    def me(self, request):
        user = request.user
        if request.method == "GET":
            serializer = self.get_serializer(user)
            return Response(serializer.data)

        # M-A1: incluir 'avatar' no conjunto de campos editáveis pelo próprio usuário
        allowed = {"first_name", "last_name", "email", "avatar", "bio"}
        filtered = {k: v for k, v in request.data.items() if k in allowed}
        # Para uploads de arquivo (multipart), request.FILES também deve ser incluído
        if "avatar" in request.FILES:
            filtered["avatar"] = request.FILES["avatar"]
        serializer = self.get_serializer(user, data=filtered, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def export(self, request):
        # A4: usar RBAC em vez de is_staff — a permissão admin.user_manage já cobre isso
        from .permissions import HasRolePermission

        if not request.user.is_superuser:
            perm_check = HasRolePermission()
            perm_check.required_permission = "admin.user_manage"
            view_copy = type("V", (), {"required_permission": "admin.user_manage"})()
            if not HasRolePermission().has_permission(request, view_copy):
                return Response(
                    {"detail": "Você não tem permissão para exportar usuários."}, status=status.HTTP_403_FORBIDDEN
                )
        qs = self.get_queryset().select_related("role")  # P1: evitar N+1 query por u.role.name
        rows = ["username,email,first_name,last_name,role"]
        for u in qs:
            role_name = u.role.name if u.role else ""
            rows.append(f"{u.username},{u.email},{u.first_name},{u.last_name},{role_name}")
        content = "\n".join(rows)
        resp = HttpResponse(content, content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="users.csv"'
        return resp


@extend_schema_view(
    list=extend_schema(tags=["Accounts - Auth"]),
    retrieve=extend_schema(tags=["Accounts - Auth"]),
    create=extend_schema(tags=["Accounts - Auth"]),
    update=extend_schema(tags=["Accounts - Auth"]),
    partial_update=extend_schema(tags=["Accounts - Auth"]),
    destroy=extend_schema(tags=["Accounts - Auth"]),
)
class RoleViewSet(viewsets.ModelViewSet):
    serializer_class = RoleSerializer
    # I-A2 + A1: exige permissão RBAC para gerenciar roles
    permission_classes = [permissions.IsAuthenticated]
    required_permission = "admin.user_manage"
    pagination_class = None

    def _get_company(self):
        company = getattr(self.request, "company", None)
        if not company and getattr(self.request, "user", None) and getattr(self.request.user, "company", None):
            company = self.request.user.company
        if not company:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(
                {"detail": "Contexto de empresa ausente. Defina X-Company-Slug ou vincule o usuário a uma empresa."}
            )
        return company

    def get_permissions(self):
        from .permissions import HasRolePermission

        # Leitura (list/retrieve) liberada para qualquer autenticado (para popular selects)
        if self.action in ("list", "retrieve", "permissions"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), HasRolePermission()]

    def get_queryset(self):
        # A1: filtrar roles pelo tenant atual — não expor roles de outros tenants
        company = getattr(self.request, "company", None)
        if not company and getattr(self.request, "user", None) and getattr(self.request.user, "company", None):
            company = self.request.user.company
        if not company:
            return Role.objects.none()
        return Role.objects.filter(company=company).order_by("name")

    def perform_create(self, serializer):
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError

        try:
            serializer.save(company=self._get_company())
        except IntegrityError:
            raise ValidationError({"detail": "Já existe um papel com esse nome nesta empresa."})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_system_role:
            return Response({"detail": "Não é possível excluir um papel do sistema."}, status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def permissions(self, request):
        """
        Lista todas as permissões disponíveis no sistema.
        """
        from .permissions import AVAILABLE_PERMISSIONS

        data = [{"id": key, "label": label, "description": label} for key, label in AVAILABLE_PERMISSIONS.items()]
        return Response(data)


@extend_schema_view(
    list=extend_schema(tags=["Accounts - Invitations"]),
    retrieve=extend_schema(tags=["Accounts - Invitations"]),
    create=extend_schema(tags=["Accounts - Invitations"], summary="Send a new invitation"),
    update=extend_schema(tags=["Accounts - Invitations"]),
    partial_update=extend_schema(tags=["Accounts - Invitations"]),
    destroy=extend_schema(tags=["Accounts - Invitations"]),
    resend=extend_schema(tags=["Accounts - Invitations"], summary="Resend invitation email"),
)
class InvitationViewSet(viewsets.ModelViewSet):
    serializer_class = InvitationSerializer
    # I-A3: exige permissão RBAC para gerenciar convites
    permission_classes = [permissions.IsAuthenticated]
    required_permission = "admin.user_manage"
    pagination_class = None

    def get_permissions(self):
        from .permissions import HasRolePermission

        return [permissions.IsAuthenticated(), HasRolePermission()]

    def get_queryset(self):
        # A2: filtrar convites pelo tenant atual — evita vazamento cross-tenant
        return (
            Invitation.objects.filter(company=self.request.company)
            .select_related("role", "company", "invited_by")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        from shared_kernel.licensing import check_feature_limit

        can_add, limit, current = check_feature_limit(self.request.company, "max_users")
        if not can_add:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(f"Limite de usuários atingido ({current}/{limit}). O convite não pode ser enviado.")

        AccountService.create_invitation(
            sender=self.request.user,
            company=self.request.company,
            email=serializer.validated_data["email"],
            role=serializer.validated_data["role"],
            crm_groups=serializer.validated_data.get("crm_groups") or [],
        )

    @action(detail=True, methods=["post"])
    def resend(self, request, pk=None):
        """
        Reenvia o e-mail de convite para o destinatário.
        """
        # A5: usar RBAC em vez de is_staff
        from .permissions import HasRolePermission

        view_copy = type("V", (), {"required_permission": "admin.user_manage"})()
        if not request.user.is_superuser and not HasRolePermission().has_permission(request, view_copy):
            return Response(
                {"detail": "Você não tem permissão para reenviar convites."}, status=status.HTTP_403_FORBIDDEN
            )
        invite = self.get_object()
        # Simple throttle: block resends within 60 seconds per invite
        cache_key = f"invite_resend:{invite.token}"
        if cache.get(cache_key):
            return Response(
                {"detail": "Aguarde antes de reenviar o convite."}, status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        from django.conf import settings

        from shared_kernel.email import send_notification_email

        invite_url = f"{settings.FRONTEND_URL}/accept-invite?token={invite.token}"
        try:
            send_notification_email(
                subject=f"Convite para {invite.company.name} - Atlas",
                recipient_list=[invite.email],
                template_name="emails/invitation.html",
                context={"company_name": invite.company.name, "invite_url": invite_url, "subject": "Convite de Acesso"},
            )
            cache.set(cache_key, True, timeout=60)
            log_action(
                request.user,
                "update",
                "Invitation",
                resource_id=invite.id,
                details={"action": "resend"},
                request=request,
            )
            return Response({"detail": "Convite reenviado com sucesso."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"detail": f"Falha ao reenviar convite: {e!s}"}, status=status.HTTP_400_BAD_REQUEST)


@extend_schema(tags=["Accounts - Invitations"], summary="Accept invitation and create account")
class AcceptInvitationView(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = AcceptInvitationSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user, error_msg = AccountService.accept_invitation(
            token=serializer.validated_data["token"],
            first_name=serializer.validated_data["first_name"],
            last_name=serializer.validated_data["last_name"],
            password=serializer.validated_data["password"],
        )

        if user:
            return Response(
                {"detail": "Conta criada com sucesso! Agora você pode fazer login."}, status=status.HTTP_201_CREATED
            )
        return Response({"detail": error_msg}, status=status.HTTP_400_BAD_REQUEST)
