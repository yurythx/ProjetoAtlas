from rest_framework import serializers
from .models import ServiceCategory, ServiceDefinition, ServiceItem

class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = "__all__"
        read_only_fields = ["company"]

class ServiceDefinitionSerializer(serializers.ModelSerializer):
    category_name = serializers.ReadOnlyField(source="category.name")
    
    class Meta:
        model = ServiceDefinition
        fields = "__all__"
        read_only_fields = ["company"]

class ServiceItemSerializer(serializers.ModelSerializer):
    definition_name = serializers.ReadOnlyField(source="definition.name")
    category_name = serializers.ReadOnlyField(source="definition.category.name")
    sla_policy_name = serializers.ReadOnlyField(source="default_sla_policy.name")

    class Meta:
        model = ServiceItem
        fields = "__all__"
        read_only_fields = ["company"]
