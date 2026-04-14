from django.contrib import admin
from .models import CIType, CI, CIRelationship

@admin.register(CIType)
class CITypeAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "criticality_level")
    list_filter = ("company", "criticality_level")
    search_fields = ("name", "description")

@admin.register(CI)
class CIAdmin(admin.ModelAdmin):
    list_display = ("name", "ci_type", "status", "company", "location")
    list_filter = ("company", "ci_type", "status")
    search_fields = ("name", "serial_number", "asset_tag")

@admin.register(CIRelationship)
class CIRelationshipAdmin(admin.ModelAdmin):
    list_display = ("source", "relation_kind", "target", "company")
    list_filter = ("company", "relation_kind")
