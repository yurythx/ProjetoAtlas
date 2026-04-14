from django.contrib import admin

from .models import Feature, License, Plan


class FeatureInline(admin.TabularInline):
    model = Plan.features.through
    extra = 1


@admin.register(Feature)
class FeatureAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "description")
    search_fields = ("name", "code")


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("name", "price", "is_active")
    inlines = [FeatureInline]


@admin.register(License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ("company", "plan", "start_date", "end_date", "is_active")
    list_filter = ("plan", "is_active")
    search_fields = ("company__name",)
