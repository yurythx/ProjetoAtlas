from rest_framework import serializers

class KBSuggestionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    slug = serializers.CharField()
    excerpt = serializers.CharField()

class KBSuggestionsResponseSerializer(serializers.Serializer):
    suggestions = KBSuggestionSerializer(many=True)
    ai_summary = serializers.CharField()
