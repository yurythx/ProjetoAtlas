from rest_framework import serializers

from shared_kernel.sanitization import sanitize_html, sanitize_plain_text

from .models import Page


class PageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = "__all__"
        read_only_fields = ["company", "created_at", "updated_at"]
        validators = []

    def validate(self, attrs):
        # Ensure company is present for validators like UniqueTogether
        request = self.context.get("request")
        if request and getattr(request, "company", None) and "company" not in attrs:
            attrs["company"] = request.company
        if attrs.get("title"):
            attrs["title"] = sanitize_plain_text(attrs["title"])
        if attrs.get("slug"):
            attrs["slug"] = sanitize_plain_text(attrs["slug"])
        if attrs.get("content"):
            attrs["content"] = sanitize_html(attrs["content"])
        if attrs.get("meta_title"):
            attrs["meta_title"] = sanitize_plain_text(attrs["meta_title"])
        if attrs.get("meta_description"):
            md = sanitize_plain_text(attrs["meta_description"])
            if len(md) > 160:
                raise serializers.ValidationError({"meta_description": "máximo de 160 caracteres"})
            attrs["meta_description"] = md
        if attrs.get("meta_keywords"):
            attrs["meta_keywords"] = sanitize_plain_text(attrs["meta_keywords"])
        return attrs


class PublicPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Page
        fields = ["title", "slug", "content", "meta_title", "meta_description", "meta_keywords"]
