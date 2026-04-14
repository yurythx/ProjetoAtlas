from rest_framework import serializers

from shared_kernel.sanitization import sanitize_html, sanitize_plain_text

from .models import Article, Category, Comment, Tag


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"
        read_only_fields = ["company"]


class PublicCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = "__all__"


class ArticleSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    author_name = serializers.CharField(source="author.username", read_only=True)
    author_info = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    company_slug = serializers.CharField(source="company.slug", read_only=True)
    tag_list = TagSerializer(source="tags", many=True, read_only=True)
    comment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Article
        fields = "__all__"
        read_only_fields = ["company", "created_at", "updated_at", "author"]

    def to_internal_value(self, data):
        # Permite que a imagem seja uma string (URL/caminho) em vez de um arquivo
        # Isso é necessário quando o usuário seleciona uma imagem da biblioteca de mídia
        if "image" in data and (isinstance(data["image"], str) or data["image"] is None):
            mutable_data = data.copy()
            image_val = mutable_data.pop("image", None)

            # Se for string vazia, trata como None
            if image_val == "":
                image_val = None

            # Validação de Segurança de Imagem (ID Harvesting prevention)
            if isinstance(image_val, str) and image_val:
                request = self.context.get("request")
                if request and hasattr(request, "company") and request.company:
                    clean_path = image_val

                    # Se for URL completa, extrai o path
                    if "://" in clean_path:
                        from urllib.parse import urlparse

                        clean_path = urlparse(clean_path).path

                    clean_path = clean_path.lstrip("/")
                    if clean_path.startswith("media/"):
                        clean_path = clean_path[6:]

                    expected_prefix = f"tenants/{request.company.slug}/"
                    allowed_prefixes = [expected_prefix, "branding/", "public/"]

                    if not any(clean_path.startswith(prefix) for prefix in allowed_prefixes):
                        raise serializers.ValidationError(
                            {"image": "A imagem selecionada não pertence à sua organização."}
                        )

            res = super().to_internal_value(mutable_data)
            res["image"] = image_val
            return res
        return super().to_internal_value(data)

    def validate(self, attrs):
        # Sanitização de campos HTML e texto
        if attrs.get("content"):
            attrs["content"] = sanitize_html(attrs["content"])
        if attrs.get("excerpt"):
            attrs["excerpt"] = sanitize_plain_text(attrs["excerpt"])
        if attrs.get("title"):
            attrs["title"] = sanitize_plain_text(attrs["title"])
        if attrs.get("meta_title"):
            attrs["meta_title"] = sanitize_plain_text(attrs["meta_title"])
        if attrs.get("meta_description"):
            md = sanitize_plain_text(attrs["meta_description"])
            if len(md) > 160:
                raise serializers.ValidationError({"meta_description": "máximo de 160 caracteres"})
            attrs["meta_description"] = md
        if attrs.get("meta_keywords"):
            attrs["meta_keywords"] = sanitize_plain_text(attrs["meta_keywords"])

        # Validação específica para artigos públicos
        is_public = attrs.get("is_public", False)
        status_value = attrs.get("status", None)

        if is_public:
            # Se o status estiver vindo no payload, ele deve ser 'published'
            if status_value is not None and status_value != Article.STATUS_PUBLISHED:
                raise serializers.ValidationError({"is_public": ('Para ser Público, o status deve ser "Publicado".')})

            # Se o status não veio no payload (edição parcial), verificamos o objeto atual
            if self.instance and status_value is None:
                if self.instance.status != Article.STATUS_PUBLISHED:
                    raise serializers.ValidationError(
                        {"is_public": "Este artigo não pode ser público porque ainda não foi publicado."}
                    )

            # Artigos públicos exigem conteúdo completo para SEO (apenas se enviados)
            if "title" in attrs and not attrs.get("title"):
                raise serializers.ValidationError({"title": "Artigos públicos devem ter título preenchido."})
            if "content" in attrs and not attrs.get("content"):
                raise serializers.ValidationError({"content": "Artigos públicos devem ter conteúdo preenchido."})
            if "excerpt" in attrs and not attrs.get("excerpt"):
                raise serializers.ValidationError(
                    {"excerpt": "Artigos públicos devem ter resumo preenchido para melhor SEO."}
                )

        return attrs

    def get_author_info(self, obj):
        author = getattr(obj, "author", None)
        if not author:
            return None
        request = self.context.get("request")
        avatar_url = None
        try:
            if getattr(author, "avatar", None) and hasattr(author.avatar, "url"):
                avatar_url = request.build_absolute_uri(author.avatar.url) if request else author.avatar.url
        except Exception:
            avatar_url = None
        full_name = author.get_full_name() or author.username
        bio = getattr(author, "bio", "") or ""
        return {
            "id": author.id,
            "username": author.username,
            "full_name": full_name,
            "avatar_url": avatar_url,
            "bio": bio,
        }


class ArticlePublicSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    author_name = serializers.CharField(source="author.username", read_only=True)
    author_info = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)
    company_slug = serializers.CharField(source="company.slug", read_only=True)
    tags = serializers.SlugRelatedField(slug_field="name", many=True, read_only=True)
    cover_image = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    comment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Article
        fields = [
            "id",
            "title",
            "slug",
            "content",
            "excerpt",
            "cover_image",
            "image",
            "category_name",
            "tags",
            "meta_title",
            "meta_description",
            "meta_keywords",
            "published_at",
            "created_at",
            "updated_at",
            "author_name",
            "author_info",
            "company_name",
            "company_slug",
            "comment_count",
        ]
        read_only_fields = fields

    def get_cover_image(self, obj):
        try:
            if obj.image and hasattr(obj.image, "url"):
                return obj.image.url
        except Exception:
            return None
        return None

    def get_image(self, obj):
        return self.get_cover_image(obj)

    def get_author_info(self, obj):
        author = getattr(obj, "author", None)
        if not author:
            return None
        request = self.context.get("request")
        avatar_url = None
        try:
            if getattr(author, "avatar", None) and hasattr(author.avatar, "url"):
                avatar_url = request.build_absolute_uri(author.avatar.url) if request else author.avatar.url
        except Exception:
            avatar_url = None
        full_name = author.get_full_name() or author.username
        bio = getattr(author, "bio", "") or ""
        return {
            "id": author.id,
            "username": author.username,
            "full_name": full_name,
            "avatar_url": avatar_url,
            "bio": bio,
        }


class CommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    article_title = serializers.CharField(source="article.title", read_only=True)
    article_slug = serializers.CharField(source="article.slug", read_only=True)

    class Meta:
        model = Comment
        fields = "__all__"
        read_only_fields = ["company", "created_at", "author", "is_approved", "is_public"]


class PublicCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    replies = serializers.SerializerMethodField()
    reply_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "content", "created_at", "author_name", "name", "is_public", "reply_count", "replies"]
        read_only_fields = fields

    def get_replies(self, obj):
        replies = getattr(obj, "prefetched_replies", None)
        if replies is None:
            replies = list(obj.replies.all())

        replies = replies[:3]

        items = []
        for r in replies:
            items.append(
                {
                    "id": r.id,
                    "content": r.content,
                    "created_at": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
                    "author_name": getattr(r.author, "username", None) if getattr(r, "author", None) else None,
                    "name": r.name,
                    "is_public": r.is_public,
                }
            )
        return items

    def validate(self, attrs):
        if attrs.get("content"):
            attrs["content"] = sanitize_plain_text(attrs["content"])
        if attrs.get("name"):
            attrs["name"] = sanitize_plain_text(attrs["name"])
        if attrs.get("email"):
            attrs["email"] = sanitize_plain_text(attrs["email"])
        return attrs


class ModerationCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    article_title = serializers.CharField(source="article.title", read_only=True)
    article_slug = serializers.CharField(source="article.slug", read_only=True)
    replies = serializers.SerializerMethodField()
    reply_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "article",
            "article_title",
            "article_slug",
            "parent",
            "content",
            "created_at",
            "is_approved",
            "is_public",
            "author_name",
            "name",
            "email",
            "reply_count",
            "replies",
        ]
        read_only_fields = fields

    def get_replies(self, obj):
        replies = getattr(obj, "prefetched_replies", None)
        if replies is None:
            replies = obj.replies.all()
        if isinstance(replies, list):
            replies = replies[:3]
        items = []
        for r in replies:
            items.append(
                {
                    "id": r.id,
                    "parent": r.parent_id,
                    "content": r.content,
                    "created_at": r.created_at.isoformat() if getattr(r, "created_at", None) else None,
                    "is_approved": r.is_approved,
                    "is_public": r.is_public,
                    "author_name": getattr(r.author, "username", None) if getattr(r, "author", None) else None,
                    "name": r.name,
                    "email": r.email,
                }
            )
        return items


class PublicReplySerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "parent", "content", "created_at", "author_name", "name", "is_public"]
        read_only_fields = fields


class ModerationReplySerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.username", read_only=True)
    article_title = serializers.CharField(source="article.title", read_only=True)
    article_slug = serializers.CharField(source="article.slug", read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "article",
            "article_title",
            "article_slug",
            "parent",
            "content",
            "created_at",
            "is_approved",
            "is_public",
            "author_name",
            "name",
            "email",
        ]
        read_only_fields = fields


class ArticleAnalyticsSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    slug = serializers.CharField()
    total_views = serializers.IntegerField()
    views_last_30_days = serializers.IntegerField()
    unique_visitors = serializers.IntegerField()


class GlobalArticlesAnalyticsSerializer(serializers.Serializer):
    total_articles = serializers.IntegerField()
    total_views = serializers.IntegerField()
    most_viewed = ArticleAnalyticsSerializer(many=True)
    views_by_date = serializers.ListField(child=serializers.DictField())


class ArticleHistorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    user = serializers.CharField()
    comment = serializers.CharField(allow_blank=True)
