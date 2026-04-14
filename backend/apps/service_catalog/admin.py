from django.contrib import admin
from .models import ServiceCategory, ServiceDefinition, ServiceItem

@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "parent")
    list_filter = ("company", "parent")
    search_fields = ("name", "description")

@admin.register(ServiceDefinition)
class ServiceDefinitionAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "company", "is_active")
    list_filter = ("company", "category", "is_active")
    search_fields = ("name", "description")

@admin.register(ServiceItem)
class ServiceItemAdmin(admin.ModelAdmin):
    list_display = ("name", "definition", "record_type", "default_sla_policy", "is_active")
    list_filter = ("company", "definition", "record_type", "is_active")
    search_fields = ("name", "description")
