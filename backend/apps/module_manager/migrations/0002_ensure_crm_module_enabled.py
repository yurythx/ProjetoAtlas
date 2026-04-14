from django.db import migrations


def forwards(apps, schema_editor):
    Module = apps.get_model("module_manager", "Module")
    TenantModule = apps.get_model("module_manager", "TenantModule")
    Company = apps.get_model("core", "Company")
    from shared_kernel.cache import invalidate_tenant_cache

    module, _ = Module.objects.get_or_create(
        code="crm",
        defaults={
            "name": "CRM",
            "description": "Gestão de leads e chamados",
            "is_default": True,
        },
    )

    updated = False
    if module.name != "CRM":
        module.name = "CRM"
        updated = True
    if module.description != "Gestão de leads e chamados":
        module.description = "Gestão de leads e chamados"
        updated = True
    if module.is_default is not True:
        module.is_default = True
        updated = True
    if updated:
        module.save(update_fields=["name", "description", "is_default"])

    for company in Company.objects.all():
        tm, created = TenantModule.objects.get_or_create(
            company=company,
            module=module,
            defaults={"is_active": True, "config": {}},
        )
        if not created and tm.is_active is not True:
            tm.is_active = True
            tm.save(update_fields=["is_active"])
        invalidate_tenant_cache("modules_v2", company.slug)


def backwards(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("module_manager", "0001_initial"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
