from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

def activate_all(company):
    if not company: return
    mods = Module.objects.all()
    for m in mods:
        # Use all_objects to bypass TenantManager filtering
        tm, created = TenantModule.all_objects.update_or_create(
            company=company, 
            module=m, 
            defaults={'is_active': True}
        )
        print(f'Activated module: {m.code} for {company.name} (Created: {created})')

# Fix Atlas Service Desk
c = Company.all_companies.filter(name='Atlas Service Desk').first()
if not c:
    c = Company.all_companies.filter(name='Suporte Backbone').first()
    if c:
        c.name = 'Atlas Service Desk'
        c.save()

if c:
    activate_all(c)

# Fix Empresa Raiz
c2 = Company.all_companies.filter(name='Empresa Raiz').first()
if c2:
    activate_all(c2)
