from django.db import migrations


def forward(apps, schema_editor):
    Column = apps.get_model("crm", "Column")

    defaults = {
        "Novo": {"column_kind": "backlog", "marks_done": False, "requires_schedule": False, "requires_assignee": False},
        "Planejados": {"column_kind": "planned", "marks_done": False, "requires_schedule": True, "requires_assignee": True},
        "Em Andamento": {"column_kind": "active", "marks_done": False, "requires_schedule": False, "requires_assignee": False},
        "Concluído": {"column_kind": "done", "marks_done": True, "requires_schedule": False, "requires_assignee": False},
        "Concluido": {"column_kind": "done", "marks_done": True, "requires_schedule": False, "requires_assignee": False},
    }

    for title, values in defaults.items():
        Column.objects.filter(legacy_stage__isnull=False, title=title).update(**values)


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0015_crmgroup_pipeline_visibility_groups"),
    ]

    operations = [
        migrations.RunPython(forward, migrations.RunPython.noop),
    ]

