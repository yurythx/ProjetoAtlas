import unicodedata

from django.db import migrations, models


def normalize_text(value):
    if not value:
        return ""

    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return " ".join(without_accents.lower().strip().split())


def infer_semantics(title):
    normalized_title = normalize_text(title)

    if normalized_title in {"novo", "new", "backlog"}:
        return {
            "column_kind": "backlog",
            "marks_done": False,
            "requires_schedule": False,
            "requires_assignee": False,
        }
    if "planejad" in normalized_title or "agendad" in normalized_title:
        return {
            "column_kind": "planned",
            "marks_done": False,
            "requires_schedule": True,
            "requires_assignee": True,
        }
    if any(token in normalized_title for token in ["andamento", "execucao", "progresso", "in progress", "doing"]):
        return {
            "column_kind": "active",
            "marks_done": False,
            "requires_schedule": False,
            "requires_assignee": False,
        }
    if any(token in normalized_title for token in ["concluid", "finaliz", "encerr", "done", "closed"]):
        return {
            "column_kind": "done",
            "marks_done": True,
            "requires_schedule": False,
            "requires_assignee": False,
        }
    return {
        "column_kind": "custom",
        "marks_done": False,
        "requires_schedule": False,
        "requires_assignee": False,
    }


def backfill_column_semantics(apps, schema_editor):
    Column = apps.get_model("crm", "Column")

    for column in Column.objects.all():
        Column.objects.filter(id=column.id).update(**infer_semantics(column.title))


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0005_deal_data_agendamento_deal_external_id_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="column",
            name="column_kind",
            field=models.CharField(
                choices=[
                    ("backlog", "Backlog"),
                    ("planned", "Planejada"),
                    ("active", "Em andamento"),
                    ("done", "Concluída"),
                    ("custom", "Customizada"),
                ],
                default="custom",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="column",
            name="marks_done",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="column",
            name="requires_assignee",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="column",
            name="requires_schedule",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_column_semantics, migrations.RunPython.noop),
    ]
