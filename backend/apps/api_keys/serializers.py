import secrets

from rest_framework import serializers

from .models import APIKey


class APIKeySerializer(serializers.ModelSerializer):
    # This field is only populated and returned during creation
    raw_key = serializers.CharField(read_only=True)

    class Meta:
        model = APIKey
        fields = ["id", "name", "prefix", "raw_key", "scopes", "is_active", "expires_at", "last_used_at", "created_at"]
        read_only_fields = ["id", "prefix", "last_used_at", "created_at"]

    def create(self, validated_data):
        # Gerar prefixo único e chave randômica
        prefix = secrets.token_hex(8)  # 16 chars
        raw_token = APIKey.generate_raw_key()

        # Garantir unicidade do prefixo
        while APIKey.objects.filter(prefix=prefix).exists():
            prefix = secrets.token_hex(8)

        instance = APIKey(company=self.context["request"].company, prefix=prefix, **validated_data)
        instance.set_key(raw_token)
        instance.save()

        # Adicionar o token completo para o admin copiar (SÓ APARECE UMA VEZ)
        instance.raw_key = f"{prefix}.{raw_token}"
        return instance
