from django.db import migrations


def sync_page_status(apps, schema_editor):
    Page = apps.get_model("pages", "Page")
    # If is_published=True, set status to published
    Page.objects.filter(is_published=True).update(status="published")


class Migration(migrations.Migration):
    dependencies = [
        ("pages", "0003_add_status_and_deprecate_is_published"),
    ]

    operations = [
        # Data migration
        migrations.RunPython(sync_page_status, reverse_code=migrations.RunPython.noop),
        # Remove field
        migrations.RemoveField(
            model_name="page",
            name="is_published",
        ),
    ]
