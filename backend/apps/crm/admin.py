from django.contrib import admin
from .models import Contact, Pipeline, Column, Deal, SLAPolicy, CRMGroup, EvolutionConfig, XLAFeedback

@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "company")
    search_fields = ("name", "email")

@admin.register(SLAPolicy)
class SLAPolicyAdmin(admin.ModelAdmin):
    list_display = ("name", "target_response_minutes", "target_resolution_minutes", "company")
    search_fields = ("name",)

@admin.register(Pipeline)
class PipelineAdmin(admin.ModelAdmin):
    list_display = ("name", "company")

@admin.register(Column)
class ColumnAdmin(admin.ModelAdmin):
    list_display = ("title", "pipeline", "column_kind", "company")
    list_filter = ("column_kind", "pipeline")

@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    list_display = ("title", "record_type", "column", "priority", "sla_status", "company")
    list_filter = ("record_type", "sla_status", "priority", "column")
    search_fields = ("title", "external_id")

@admin.register(CRMGroup)
class CRMGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "company")

@admin.register(EvolutionConfig)
class EvolutionConfigAdmin(admin.ModelAdmin):
    list_display = ("instance_name", "api_url", "is_active", "company", "webhook_token")
    list_filter = ("is_active",)
    readonly_fields = ("webhook_token",)
    fieldsets = (
        ("Instância", {"fields": ("instance_name", "api_url", "api_token", "is_active", "company")}),
        ("Webhook", {"fields": ("webhook_token",), "description": "Token gerado automaticamente. Use-o na URL do webhook da Evolution API."}),
        ("Roteamento Padrão", {"fields": ("default_pipeline", "default_column")}),
    )

@admin.register(XLAFeedback)
class XLAFeedbackAdmin(admin.ModelAdmin):
    list_display = ("deal", "rating", "speed_satisfaction", "outcome_satisfaction", "created_at", "company")
    list_filter = ("rating",)
    search_fields = ("deal__title",)
    readonly_fields = ("created_at",)
