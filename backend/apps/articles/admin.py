from django.contrib import admin

from .models import Article, Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "company")
    list_filter = ("company",)
    search_fields = ("name", "company__name")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "company", "author", "is_public", "status", "published_at")
    list_filter = ("company", "is_public", "status", "category")
    search_fields = ("title", "company__name", "author__username")
    prepopulated_fields = {"slug": ("title",)}

    fieldsets = (
        ("Conteúdo", {"fields": ("title", "slug", "content", "excerpt", "image", "category", "tags")}),
        (
            "Visibilidade e Status",
            {
                "fields": ("is_public", "status", "published_at"),
                "description": "Artigos públicos são visíveis para todos. Privados apenas para membros da empresa.",
            },
        ),
        ("Metadados", {"fields": ("author", "company"), "classes": ("collapse",)}),
        ("SEO", {"fields": ("meta_title", "meta_description", "meta_keywords"), "classes": ("collapse",)}),
    )
    readonly_fields = ("author", "company")
