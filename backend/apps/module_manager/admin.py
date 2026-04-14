from django.contrib import admin

from .models import Module, TenantModule


@admin.register(Module)
class ModuleAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_default")
    search_fields = ("name", "code")


@admin.register(TenantModule)
class TenantModuleAdmin(admin.ModelAdmin):
    list_display = ("company", "module", "is_active")
    list_filter = ("module", "is_active")
    search_fields = ("company__name",)
