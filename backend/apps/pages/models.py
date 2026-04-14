from django.contrib.postgres.indexes import GinIndex
from django.db import models

from shared_kernel.models import BaseTenantModel


class Page(BaseTenantModel):
    """
    Páginas estáticas do site (ex: Home, Sobre, Contato).
    """

    STATUS_DRAFT = "draft"
    STATUS_PUBLISHED = "published"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Rascunho"),
        (STATUS_PUBLISHED, "Publicado"),
    ]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=200)
    content = models.TextField(blank=True)  # Pode ser HTML ou Markdown

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # SEO fields
    meta_title = models.CharField(max_length=200, blank=True)
    meta_description = models.CharField(max_length=500, blank=True)
    meta_keywords = models.CharField(max_length=500, blank=True)

    class Meta:
        unique_together = ("company", "slug")
        indexes = [
            GinIndex(name="page_title_gin", fields=["title"], opclasses=["gin_trgm_ops"]),
            GinIndex(name="page_content_gin", fields=["content"], opclasses=["gin_trgm_ops"]),
        ]

    def __str__(self):
        return f"{self.company.name} - {self.title}"
