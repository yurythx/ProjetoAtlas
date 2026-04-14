import reversion
from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models

from shared_kernel.models import BaseTenantModel
from shared_kernel.utils import tenant_upload_to
from shared_kernel.validators import validate_image


@reversion.register()
class Category(BaseTenantModel):
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=100)

    class Meta:
        unique_together = ("company", "slug")
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


@reversion.register()
class Tag(BaseTenantModel):
    name = models.CharField(max_length=50)
    slug = models.SlugField(max_length=50)

    # SEO fields
    meta_title = models.CharField(max_length=200, blank=True)
    meta_description = models.TextField(blank=True)

    class Meta:
        unique_together = ("company", "slug")

    def __str__(self):
        return self.name


@reversion.register()
class Article(BaseTenantModel):
    STATUS_DRAFT = "draft"
    STATUS_PENDING = "pending"
    STATUS_SCHEDULED = "scheduled"
    STATUS_PUBLISHED = "published"
    STATUS_REJECTED = "rejected"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Rascunho"),
        (STATUS_PENDING, "Aguardando Revisão"),
        (STATUS_SCHEDULED, "Agendado"),
        (STATUS_PUBLISHED, "Publicado"),
        (STATUS_REJECTED, "Rejeitado"),
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200)
    content = models.TextField()
    excerpt = models.TextField(blank=True, help_text="Resumo do artigo")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="articles")
    tags = models.ManyToManyField(Tag, blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(
        blank=True, verbose_name="Motivo da Rejeição", help_text="Preenchido pelo revisor ao rejeitar um artigo."
    )

    # Visibility control
    is_public = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Público",
        help_text="Se True, o artigo será visível para todos, independente de autenticação. Se False, apenas membros da empresa podem ver.",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    image = models.ImageField(
        upload_to=tenant_upload_to("articles"),
        null=True,
        blank=True,
        validators=[validate_image],
        help_text="Imagem de destaque (max 10MB, formatos: JPEG, PNG, GIF, WebP)",
    )

    # SEO fields
    meta_title = models.CharField(max_length=200, blank=True)
    meta_description = models.TextField(blank=True)
    meta_keywords = models.CharField(max_length=500, blank=True)

    class Meta:
        unique_together = ("company", "slug")
        indexes = [
            models.Index(fields=["is_public", "-published_at"], name="article_public_pub_idx"),
            models.Index(fields=["is_public", "slug"], name="article_public_slug_idx"),
            models.Index(fields=["company", "is_public", "-published_at"], name="article_tenant_pub_idx"),
            GinIndex(name="article_title_gin", fields=["title"], opclasses=["gin_trgm_ops"]),
            GinIndex(name="article_content_gin", fields=["content"], opclasses=["gin_trgm_ops"]),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        # Garante que artigos públicos só possam existir com status publicado
        if self.is_public and self.status != self.STATUS_PUBLISHED:
            raise ValidationError(
                {
                    "is_public": (
                        "Um artigo só pode ser marcado como público quando estiver publicado. "
                        f'Status atual: "{self.get_status_display()}".'
                    )
                }
            )

    def __str__(self):
        return self.title


class ArticleView(BaseTenantModel):
    article = models.ForeignKey(Article, related_name="views", on_delete=models.CASCADE)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["article", "viewed_at"]),
            models.Index(fields=["company", "viewed_at"]),
        ]


@reversion.register()
class Comment(BaseTenantModel):
    article = models.ForeignKey(Article, related_name="comments", on_delete=models.CASCADE)
    parent = models.ForeignKey("self", null=True, blank=True, related_name="replies", on_delete=models.CASCADE)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    content = models.TextField()
    is_public = models.BooleanField(default=False, db_index=True)
    is_approved = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Comment by {self.author or self.name} on {self.article}"
