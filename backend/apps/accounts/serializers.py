from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.core.models import Company
from apps.core.serializers import CompanySerializer
from apps.crm.models import CRMGroup

from .models import Invitation, Role, UserNotificationPreference, UserThemePreference

User = get_user_model()


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        from django.contrib.auth.signals import user_logged_in

        data = super().validate(attrs)

        # Dispara o sinal para que o log de auditoria capture o evento
        user_logged_in.send(
            sender=self.user.__class__,
            request=self.context.get("request"),
            user=self.user
        )
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        # Add custom claims
        token["username"] = user.username
        token["email"] = user.email
        token["first_name"] = user.first_name
        token["last_name"] = user.last_name

        # Add company info if available
        if hasattr(user, "company") and user.company:
            token["company_slug"] = user.company.slug

        return token


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name", "description", "permissions", "is_system_role"]
        read_only_fields = ["id", "is_system_role"]


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    company_slug = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "first_name", "last_name", "company_slug"]
        read_only_fields = ["id"]

    def validate_company_slug(self, value):
        try:
            return Company.objects.get(slug=value)
        except Company.DoesNotExist:
            raise serializers.ValidationError("Empresa não encontrada.")

    def validate(self, attrs):
        # Apply Django's password validators
        # Normalize fields
        if attrs.get("email"):
            attrs["email"] = attrs["email"].strip().lower()
        if attrs.get("username"):
            attrs["username"] = attrs["username"].strip()
        password = attrs.get("password")
        # Provide context user for validators that check similarity
        context_user = User(
            username=attrs.get("username"),
            email=attrs.get("email"),
            first_name=attrs.get("first_name"),
            last_name=attrs.get("last_name"),
        )
        validate_password(password, user=context_user)
        return attrs

    def create(self, validated_data):
        from django.db import transaction

        company = validated_data.pop("company_slug")
        password = validated_data.pop("password")

        with transaction.atomic():
            # O BaseTenantModel requer que 'company' seja passado na criação
            user = User.objects.create_user(company=company, password=password, **validated_data)

            # Se for o primeiro usuário da empresa, atribui papel de Administrador
            user_count = User.all_objects.filter(company=company).count()
            if user_count == 1:
                from .models import Role
                from .services import AccountService

                # Garante que as roles existam
                AccountService.ensure_default_roles(company)
                try:
                    admin_role = Role.all_objects.get(name="Administrador", company=company)
                    user.role = admin_role
                    user.save(update_fields=["role"])
                except Role.DoesNotExist:
                    pass

        return user


class UserSerializer(serializers.ModelSerializer):
    role_details = RoleSerializer(source="role", read_only=True)
    company_details = CompanySerializer(source="company", read_only=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    avatar_url = serializers.SerializerMethodField()
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False)
    # A3: role filtrada pelo tenant do request — impede atribuir role de outro tenant
    role = serializers.SerializerMethodField(read_only=False)
    # Explicitly define avatar to handle file uploads properly
    avatar = serializers.ImageField(required=False, allow_null=True)
    crm_groups = serializers.PrimaryKeyRelatedField(queryset=CRMGroup.all_objects.all(), many=True, required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "role_details",
            "company",
            "company_details",
            "is_superuser",
            "is_staff",
            "is_active",
            "avatar",
            "avatar_url",
            "password",
            "status",
            "bio",
            "crm_groups",
            "last_login",
            "date_joined",
            "last_seen",
        ]
        # I-A1: is_superuser e is_staff são read_only — não podem ser alterados via API
        read_only_fields = ["id", "company_details", "role_details", "avatar_url", "is_superuser", "is_staff", "last_login", "date_joined", "last_seen"]
        extra_kwargs = {
            "role": {"required": False},
            "company": {"required": False},
            "email": {"required": False},
            "username": {"required": False},
            "is_active": {"required": False},
        }

    def validate(self, attrs):
        request = self.context.get("request")
        if request and self.instance and "is_active" in attrs:
            if self.instance.id == getattr(request.user, "id", None) and attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "Você não pode desativar o próprio usuário."})

        password = attrs.get("password")
        if password:
            from django.core.exceptions import ValidationError

            context_user = self.instance or User(
                username=attrs.get("username"),
                email=attrs.get("email"),
                first_name=attrs.get("first_name"),
                last_name=attrs.get("last_name"),
            )
            try:
                validate_password(password, user=context_user)
            except ValidationError as e:
                raise serializers.ValidationError({"password": e.messages[0]})

        return attrs

    def validate_crm_groups(self, groups):
        request = self.context.get("request")
        target_company = None

        if self.instance and getattr(self.instance, "company_id", None):
            target_company = self.instance.company
        if not target_company and request and getattr(request, "company", None):
            target_company = request.company
        if not target_company and request and getattr(request, "user", None) and getattr(request.user, "company", None):
            target_company = request.user.company

        if not target_company:
            if groups:
                raise serializers.ValidationError("Contexto de empresa ausente para atribuir grupos do CRM.")
            return groups

        invalid = [group.id for group in groups if group.company_id != target_company.id]
        if invalid:
            raise serializers.ValidationError("Um ou mais grupos do CRM não pertencem a esta empresa.")
        return groups

    def get_role(self, obj):
        """Retorna o ID da role atual do usuário (para leitura no get_role field)."""
        return obj.role_id

    def to_internal_value(self, data):
        """A3: Ao receber role como ID, valida que pertence ao mesmo tenant."""
        result = super().to_internal_value(data)
        role_id = data.get("role")
        if role_id is not None:
            from .models import Role

            request = self.context.get("request")
            company = getattr(request, "company", None) if request else None
            if not company and request and getattr(request, "user", None) and getattr(request.user, "company", None):
                company = request.user.company
            try:
                if request and request.user.is_superuser:
                    # Superusuário pode atribuir role globalmente, mas deve ser da mesma empresa do alvo
                    role = Role.all_objects.get(pk=role_id)
                    target_company = result.get("company") or (self.instance.company if self.instance else None)
                    if target_company and role.company_id != getattr(target_company, "id", target_company):
                        raise serializers.ValidationError({"role": "O papel não pertence à mesma empresa do usuário."})
                elif company:
                    # Usuários normais só podem atribuir roles do seu tenant
                    role = Role.objects.filter(company=company).get(pk=role_id)
                else:
                    raise serializers.ValidationError({"role": "Contexto de empresa inválido."})
                result["role"] = role
            except Role.DoesNotExist:
                raise serializers.ValidationError({"role": "Papel de acesso inválido ou não pertence a esta empresa."})
        return result

    def get_avatar_url(self, obj):
        if obj.avatar:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.avatar.url)
            return obj.avatar.url
        return None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        company = getattr(request, "company", None) if request else None
        if not company and request and getattr(request, "user", None) and getattr(request.user, "company", None):
            company = request.user.company
        if company is not None:
            self.fields["crm_groups"].queryset = CRMGroup.all_objects.all()

    def create(self, validated_data):
        crm_groups = validated_data.pop("crm_groups", [])
        password = validated_data.pop("password", None)
        user = User.objects.create_user(password=password, **validated_data)
        if crm_groups:
            user.crm_groups.set(crm_groups)
        return user

    def update(self, instance, validated_data):
        crm_groups = validated_data.pop("crm_groups", None)
        password = validated_data.pop("password", None)
        # `role` is validated and resolved to a Role instance by to_internal_value().
        # super().update() handles assignment directly via the validated instance.
        user = super().update(instance, validated_data)

        if crm_groups is not None:
            user.crm_groups.set(crm_groups)

        if password:
            user.set_password(password)
            user.save(update_fields=["password"])

        return user


class UserThemePreferenceSerializer(serializers.ModelSerializer):
    """
    Serializer para preferências de tema do usuário.
    """

    user_details = UserSerializer(source="user", read_only=True)

    class Meta:
        model = UserThemePreference
        fields = [
            "id",
            "user",
            "user_details",
            "theme_palette",
            "use_tenant_theme",
            "dark_mode_preference",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class UserNotificationPreferenceSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source="user", read_only=True)

    class Meta:
        model = UserNotificationPreference
        fields = [
            "id",
            "user",
            "user_details",
            "notify_moderation_comment_pending",
            "notify_moderation_reply_pending",
            "notify_moderation_article_pending",
            "notify_reply_approved_single",
            "notify_reply_approved_thread",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data["new_password"] != data["confirm_password"]:
            raise serializers.ValidationError("As senhas não coincidem.")
        return data


class InvitationSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)
    crm_groups = serializers.PrimaryKeyRelatedField(queryset=CRMGroup.all_objects.all(), many=True, required=False)

    class Meta:
        model = Invitation
        fields = ["id", "email", "role", "role_name", "crm_groups", "status", "expires_at", "created_at"]
        read_only_fields = ["id", "status", "expires_at", "created_at"]

    def validate_crm_groups(self, groups):
        request = self.context.get("request")
        company = getattr(request, "company", None) if request else None
        if not company and request and getattr(request, "user", None) and getattr(request.user, "company", None):
            company = request.user.company
        if not company:
            if groups:
                raise serializers.ValidationError("Contexto de empresa ausente para atribuir grupos do CRM.")
            return groups

        invalid = [group.id for group in groups if group.company_id != company.id]
        if invalid:
            raise serializers.ValidationError("Um ou mais grupos do CRM não pertencem a esta empresa.")
        return groups


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data["password"] != data["confirm_password"]:
            raise serializers.ValidationError("As senhas não coincidem.")
        return data
