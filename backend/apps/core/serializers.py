from rest_framework import serializers

from shared_kernel.sanitization import sanitize_url

from .models import AuditLog, Company, LDAPConfig, TenantBranding


class TenantBrandingSerializer(serializers.ModelSerializer):
    """
    Serializer para configurações de branding do tenant.
    Suporta upload de logo e ícone.
    """

    logo_url = serializers.SerializerMethodField()
    icon_url = serializers.SerializerMethodField()

    class Meta:
        model = TenantBranding
        fields = [
            "id",
            "company",
            "company_name",
            "logo",
            "logo_url",
            "icon",
            "icon_url",
            "primary_color",
            "secondary_color",
            "background_color",
            "font_family",
            "theme_palette",
            "custom_css",
            "footer_text",
            "facebook_url",
            "instagram_url",
            "linkedin_url",
            "twitter_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "company"]

    def _validate_social_url(self, value: str | None):
        if value in ("", None):
            return ""
        sanitized = sanitize_url(str(value), allowed_protocols=["http", "https"])
        if not sanitized:
            raise serializers.ValidationError("URL inválida.")
        return sanitized

    def validate_facebook_url(self, value):
        return self._validate_social_url(value)

    def validate_instagram_url(self, value):
        return self._validate_social_url(value)

    def validate_linkedin_url(self, value):
        return self._validate_social_url(value)

    def validate_twitter_url(self, value):
        return self._validate_social_url(value)

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None

    def get_icon_url(self, obj):
        if obj.icon:
            request = self.context.get("request")
            if request:
                return request.build_absolute_uri(obj.icon.url)
            return obj.icon.url
        return None


class CompanySerializer(serializers.ModelSerializer):
    theme_branding = TenantBrandingSerializer(read_only=True)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "slug",
            "domain",
            "onboarding_completed",
            "onboarding_step",
            "theme_branding",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CompanyUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["name", "domain"]


class TenantEmailConfigSerializer(serializers.ModelSerializer):
    smtp_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        from .models import TenantEmailConfig

        model = TenantEmailConfig
        fields = [
            "id",
            "use_custom_smtp",
            "smtp_host",
            "smtp_port",
            "smtp_user",
            "smtp_password",
            "smtp_use_tls",
            "from_email",
        ]

    def update(self, instance, validated_data):
        password = validated_data.pop("smtp_password", None)
        instance = super().update(instance, validated_data)
        if password is not None:
            instance.set_smtp_password(password)
            instance.save()
        return instance


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "user_name",
            "user_email",
            "action",
            "resource",
            "resource_id",
            "details",
            "ip_address",
            "created_at",
        ]
        read_only_fields = fields


class DashboardCounterSerializer(serializers.Serializer):
    total = serializers.IntegerField(required=False)
    new_this_month = serializers.IntegerField(required=False)
    growth = serializers.FloatField(required=False)


class DashboardCRMCounterSerializer(serializers.Serializer):
    total_deals = serializers.IntegerField()
    active_swarms = serializers.IntegerField()
    csi_identified = serializers.IntegerField()


class DashboardFinanceCounterSerializer(serializers.Serializer):
    revenue_month = serializers.FloatField()
    expenses_month = serializers.FloatField()
    balance_month = serializers.FloatField()


class DashboardChartDataSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    name = serializers.CharField(required=False)
    count = serializers.IntegerField(required=False)
    article_count = serializers.IntegerField(required=False)


class RecentActivityUserSerializer(serializers.Serializer):
    name = serializers.CharField()
    avatar = serializers.URLField(allow_null=True)


class RecentActivitySerializer(serializers.Serializer):
    action = serializers.CharField()
    resource = serializers.CharField()
    created_at = serializers.DateTimeField()
    user = RecentActivityUserSerializer()


class SystemStatusSerializer(serializers.Serializer):
    storage_used = serializers.CharField()
    api_uptime = serializers.CharField()
    last_backup = serializers.DateTimeField()


class DashboardStatsSerializer(serializers.Serializer):
    counters = serializers.DictField() # Flexible to allow different structures
    charts = serializers.DictField(child=serializers.ListField(child=DashboardChartDataSerializer()))
    recent_activity = RecentActivitySerializer(many=True)
    system_status = SystemStatusSerializer()


class GlobalSearchSerializer(serializers.Serializer):
    articles = serializers.ListField(child=serializers.DictField())
    pages = serializers.ListField(child=serializers.DictField())
    messages = serializers.ListField(child=serializers.DictField())
    contacts = serializers.ListField(child=serializers.DictField())


class RobotsSerializer(serializers.Serializer):
    robots_content = serializers.CharField()


class LDAPConfigSerializer(serializers.ModelSerializer):
    """Serializer para configuração LDAP do tenant."""

    bind_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = LDAPConfig
        fields = [
            "id",
            "company",
            "enabled",
            "server_uri",
            "bind_dn",
            "bind_password",
            "user_search_base",
            "user_search_filter",
            "attr_username",
            "attr_email",
            "attr_first_name",
            "attr_last_name",
            "use_tls",
            "require_group",
            "admin_group_dn",
            "last_test_status",
            "last_test_message",
            "last_test_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "company",
            "last_test_status",
            "last_test_message",
            "last_test_at",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        password = validated_data.pop("bind_password", None)
        instance = super().create(validated_data)
        if password:
            instance.set_bind_password(password)
            instance.save()
        return instance

    def update(self, instance, validated_data):
        password = validated_data.pop("bind_password", None)
        instance = super().update(instance, validated_data)
        if password:
            instance.set_bind_password(password)
            instance.save()
        return instance

    def validate(self, data):
        """Validar campos obrigatórios quando LDAP está habilitado."""
        # Se for update, data pode não ter todos os campos, usar instance como fallback
        is_enabled = data.get("enabled")
        if is_enabled is None and self.instance:
            is_enabled = self.instance.enabled

        if is_enabled:
            required_fields = {"server_uri": "Server URI", "bind_dn": "Bind DN", "user_search_base": "User Search Base"}

            errors = {}
            for field, label in required_fields.items():
                value = data.get(field)
                if value is None and self.instance:
                    value = getattr(self.instance, field)

                if not value:
                    errors[field] = f"{label} é obrigatório quando LDAP está ativado."

            # Validar filtro de busca
            filter_val = data.get("user_search_filter")
            if filter_val is None and self.instance:
                filter_val = self.instance.user_search_filter

            if filter_val and "%(user)s" not in filter_val:
                errors["user_search_filter"] = "O filtro deve conter o placeholder %(user)s"

            if errors:
                raise serializers.ValidationError(errors)

        return data
