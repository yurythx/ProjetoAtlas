from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ("username", "email", "company", "is_staff", "is_active")
    list_filter = ("company", "is_staff", "is_active")
    fieldsets = (*UserAdmin.fieldsets, ("Tenant Info", {"fields": ("company",)}))
    add_fieldsets = (*UserAdmin.add_fieldsets, ("Tenant Info", {"fields": ("company",)}))
