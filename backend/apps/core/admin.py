from django.contrib import admin

from .models import Company


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "domain", "created_at")
    search_fields = ("name", "slug", "domain")
    prepopulated_fields = {"slug": ("name",)}
