from django.contrib import admin

from .models import Page


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "company", "status", "created_at")
    list_filter = ("company", "status")
    search_fields = ("title", "slug", "company__name")
    prepopulated_fields = {"slug": ("title",)}
