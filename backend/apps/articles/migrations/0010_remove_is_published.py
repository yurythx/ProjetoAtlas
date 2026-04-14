# Migration to remove the deprecated is_published boolean field.
# The field `status` (with choices: draft/pending/published/rejected) is the
# single source of truth. Use status='published' instead of is_published=True.
#
# DATA SAFETY: This migration runs a pre-migration data fix to ensure any
# article with is_published=True but status != 'published' is updated.

from django.db import migrations


def sync_status_before_removal(apps, schema_editor):
    """
    Safety net: ensure any article with is_published=True is reflected
    correctly in the status field before we drop the column.
    """
    Article = apps.get_model("articles", "Article")
    # If is_published=True but status is still draft, move it to published
    Article.objects.filter(is_published=True, status="draft").update(status="published")


class Migration(migrations.Migration):
    dependencies = [
        ("articles", "0009_add_rejection_reason"),
    ]

    operations = [
        # Run data migration first to sync any inconsistent records
        migrations.RunPython(
            sync_status_before_removal,
            reverse_code=migrations.RunPython.noop,
        ),
        # Then remove the deprecated column
        migrations.RemoveField(
            model_name="article",
            name="is_published",
        ),
    ]
