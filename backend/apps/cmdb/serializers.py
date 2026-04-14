from rest_framework import serializers
from .models import CIType, CI, CIRelationship

class CITypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = CIType
        fields = "__all__"

class CISerializer(serializers.ModelSerializer):
    ci_type_name = serializers.ReadOnlyField(source="ci_type.name")
    owner_name = serializers.ReadOnlyField(source="owner.username")

    class Meta:
        model = CI
        fields = "__all__"

class CIRelationshipSerializer(serializers.ModelSerializer):
    source_name = serializers.ReadOnlyField(source="source.name")
    target_name = serializers.ReadOnlyField(source="target.name")

    class Meta:
        model = CIRelationship
        fields = "__all__"
