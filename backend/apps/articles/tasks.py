"""
Celery tasks for the articles app.
"""

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(
    name="articles.notify_article_published",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    ignore_result=True,
)
def notify_article_published(self, article_id):
    """
    Sends push notifications to all active users of a company when an article is published.
    Runs asynchronously to avoid blocking the Django request worker.
    """
    try:
        from apps.accounts.models import User
        from apps.notifications.tasks import notify_user_push

        from .models import Article

        article = Article.objects.select_related("company").get(pk=article_id)
        active_users = User.objects.filter(company=article.company, is_active=True)

        for target_user in active_users:
            try:
                notify_user_push(
                    target_user,
                    title=f"Novo Artigo: {article.title}",
                    message=article.excerpt or "Confira a nova publicação!",
                    link=f"/artigos/{article.slug}",
                )
            except Exception:
                pass  # individual failure must not abort the entire task

    except Exception as exc:
        raise self.retry(exc=exc)


@shared_task(name="articles.publish_scheduled_articles")
def publish_scheduled_articles():
    """
    Periodic task to check for scheduled articles and publish them if their time has come.
    """
    from django.utils import timezone

    from apps.accounts.models import User

    from .models import Article
    from .services import ArticleService

    now = timezone.now()
    # Pega os artigos agendados que já passaram da hora
    scheduled_articles = Article.all_objects.filter(
        status=Article.STATUS_SCHEDULED,
        published_at__lte=now
    ).select_related("author", "company")

    for article in scheduled_articles:
        # Usa o autor original como usuário da ação, ou um admin caso falhe
        user = article.author or User.all_objects.filter(company=article.company, is_superuser=True).first()
        if user:
            try:
                ArticleService.publish_article(user, article)
            except Exception as e:
                logger.error(f"Failed to publish scheduled article {article.id}: {e}")

@shared_task(
    name="articles.record_article_view_async",
    ignore_result=True,
    # Low priority — losing a view count is acceptable; no retries needed.
    max_retries=0,
)
def record_article_view_async(article_id, user_id=None, ip_address=None):
    """
    P3: Persists an ArticleView entry asynchronously.

    The cache-based deduplication check is done synchronously in record_view()
    (cheap cache GET) before this task is dispatched, so duplicate entries
    are prevented without adding DB write latency to the request cycle.
    """
    from .models import Article, ArticleView

    try:
        article = Article.all_objects.select_related("company").get(pk=article_id)
    except Article.DoesNotExist:
        logger.warning("record_article_view_async: Article %s not found", article_id)
        return

    user = None
    if user_id is not None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            user = User.all_objects.get(pk=user_id)
        except User.DoesNotExist:
            pass

    ArticleView.objects.create(
        company=article.company,
        article=article,
        user=user,
        ip_address=ip_address,
    )
