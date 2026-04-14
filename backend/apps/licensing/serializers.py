from rest_framework import serializers

from .models import Feature, License, Plan, PlanFeature


class FeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = "__all__"


class PlanFeatureSerializer(serializers.ModelSerializer):
    feature_code = serializers.CharField(source="feature.code", read_only=True)
    feature_name = serializers.CharField(source="feature.name", read_only=True)

    class Meta:
        model = PlanFeature
        fields = ["id", "feature", "feature_code", "feature_name", "value"]


class PlanSerializer(serializers.ModelSerializer):
    features = PlanFeatureSerializer(source="planfeature_set", many=True, read_only=True)

    class Meta:
        model = Plan
        fields = "__all__"


class LicenseSerializer(serializers.ModelSerializer):
    plan_details = PlanSerializer(source="plan", read_only=True)

    class Meta:
        model = License
        fields = ["id", "plan", "plan_details", "is_active", "start_date", "end_date"]
        read_only_fields = ["id", "start_date", "end_date"]


class UsageItemSerializer(serializers.Serializer):
    current = serializers.IntegerField()
    limit = serializers.IntegerField()
    label = serializers.CharField()


class UsageResponseSerializer(serializers.Serializer):
    plan = serializers.CharField()
    usage = serializers.DictField(child=UsageItemSerializer())
    limits = serializers.DictField(child=serializers.CharField())
