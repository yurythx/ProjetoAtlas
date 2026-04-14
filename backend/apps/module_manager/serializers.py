from rest_framework import serializers

from .models import Module, TenantModule


class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = "__all__"


class TenantModuleSerializer(serializers.ModelSerializer):
    module_code = serializers.CharField(source="module.code", read_only=True)
    module_name = serializers.CharField(source="module.name", read_only=True)

    class Meta:
        model = TenantModule
        fields = ["id", "module", "module_code", "module_name", "is_active", "config"]
        read_only_fields = ["module"]  # Módulo não muda na edição, cria-se um novo TenantModule se precisar
