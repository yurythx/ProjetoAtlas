from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("articles", "0015_articleview_created_at_articleview_updated_at_and_more"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="comment",
            index=models.Index(
                fields=["article", "is_approved", "is_public"],
                name="art_comment_article_approved_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="comment",
            index=models.Index(
                fields=["company", "is_approved", "created_at"],
                name="art_comment_company_moderation_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="comment",
            index=models.Index(
                fields=["article", "parent"],
                name="art_comment_article_parent_idx",
            ),
        ),
    ]
