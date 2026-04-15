from rest_framework import serializers
from .models import Media

class MediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            'id', 'file', 'file_url', 'title', 
            'alt_text', 'file_type', 'file_size', 
            'created_at'
        ]
        read_only_fields = ['id', 'file_url', 'file_type', 'file_size', 'created_at']

    def get_file_url(self, obj):
        if obj.file:
            return obj.file.url
        return None

    def create(self, validated_data):
        file = validated_data.get('file')
        if file:
            validated_data['file_type'] = file.content_type
            validated_data['file_size'] = file.size
            if not validated_data.get('title'):
                validated_data['title'] = file.name
        return super().create(validated_data)
