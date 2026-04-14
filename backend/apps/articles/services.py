from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.webhooks.tasks import trigger_webhooks
from shared_kernel.audit import log_create, log_delete, log_update

from .models import Article


class ArticleService:
    @staticmethod
    def _normalize_image_path(url_or_path: str | None) -> str | None:
        if not url_or_path:
            return None
        from urllib.parse import urlparse

        from django.conf import settings

        raw = str(url_or_path).strip()
        if not raw:
            return None

        path = raw
        if "://" in path:
            try:
                path = urlparse(path).path or ""
            except Exception:
                path = raw
        path = path.strip()
        if not path:
            return None

        media_url = getattr(settings, "MEDIA_URL", "/media/") or "/media/"
        if not media_url.startswith("/"):
            media_url = f"/{media_url}"
        if not media_url.endswith("/"):
            media_url = f"{media_url}/"

        if path.startswith(media_url):
            path = path[len(media_url) :]
        path = path.lstrip("/")
        if path.startswith("media/"):
            path = path[len("media/") :]
        return path or None

    @staticmethod
    def create_article(user, company, data, image=None):
        """
        Creates an article with audit logging and automatic slug generation if missing.
        """
        import reversion

        with reversion.create_revision():
            tags_data = data.pop("tags", [])
            image_path = None
            if "image" in data and isinstance(data.get("image"), str):
                image_path = ArticleService._normalize_image_path(data.pop("image"))

            # Auto-slug if not provided
            if not data.get("slug"):
                data["slug"] = slugify(data.get("title", ""))
            # Ensure slug uniqueness within the company
            base_slug = data.get("slug") or ""
            candidate = base_slug
            index = 1
            while Article.objects.filter(company=company, slug=candidate).exists():
                candidate = f"{base_slug}-{index}"
                index += 1
            data["slug"] = candidate

            article = Article.objects.create(company=company, author=user, **data)

            if tags_data:
                article.tags.set(tags_data)

            # Prefer uploaded file; fallback to string path if available
            if image:
                article.image = image
                article.save()
            elif image_path:
                # Assign path string relative to storage
                article.image.name = image_path.lstrip("/")
                article.save()

            reversion.set_user(user)
            reversion.set_comment(f"Created by {user.username}")

        from types import SimpleNamespace

        log_create(user, "Article", article, request=SimpleNamespace(company=company))

        trigger_webhooks(
            company,
            "article.created",
            {"id": str(article.id), "title": article.title, "slug": article.slug, "author": user.username},
        )
        return article

    @staticmethod
    def _invalidate_article_cache(article):
        from django.core.cache import cache

        c_slug = getattr(article.company, "slug", "")
        if c_slug:
            cache.delete(f"art_det:{c_slug}:{article.slug}")
            cache.delete(f"article_pub_detail:{c_slug}:{article.slug}")
            cache.delete(f"art_p_det:{c_slug}:{article.slug}")

    @staticmethod
    def update_article(user, article, data, image=None, revision_comment: str | None = None):
        """
        Updates an article and logs the change.
        """
        import reversion

        with reversion.create_revision():
            tags_data = data.pop("tags", None)
            image_path = None
            if "image" in data and isinstance(data.get("image"), str):
                image_path = ArticleService._normalize_image_path(data.pop("image"))

            # If status is being updated, ensure valid transition
            new_status = data.get("status")
            if new_status and new_status != article.status:
                # Basic validation logic could go here
                pass

            for attr, value in data.items():
                setattr(article, attr, value)

            if tags_data is not None:
                article.tags.set(tags_data)

            if image:
                article.image = image
            elif image_path:
                article.image.name = image_path.lstrip("/")

            article.save()

            reversion.set_user(user)
            reversion.set_comment(revision_comment or f"Updated by {user.username}")

        from types import SimpleNamespace

        log_update(user, "Article", article, request=SimpleNamespace(company=article.company))

        trigger_webhooks(
            article.company,
            "article.updated",
            {"id": str(article.id), "title": article.title, "slug": article.slug, "status": article.status},
        )

        # Invalida cache de leitura
        ArticleService._invalidate_article_cache(article)

        return article

    @staticmethod
    def submit_for_review(user, article):
        if article.status != Article.STATUS_DRAFT:
            raise ValueError("Only drafts can be submitted for review")

        return ArticleService.update_article(
            user, article, {"status": Article.STATUS_PENDING}, revision_comment="Submitted for review"
        )

    @staticmethod
    def publish_article(user, article):
        if not user.has_perm("articles.publish_article"):
            # This check depends on permission system setup, if strict:
            # raise PermissionDenied("User does not have permission to publish")
            pass

        if article.status not in [Article.STATUS_PENDING, Article.STATUS_DRAFT, Article.STATUS_SCHEDULED]:
            raise ValueError("Only pending, scheduled or draft articles can be published")

        # Verifica se o artigo tem data de publicação futura (Agendamento)
        now = timezone.now()
        is_scheduled = article.published_at and article.published_at > now

        update_data = {
            "status": Article.STATUS_SCHEDULED if is_scheduled else Article.STATUS_PUBLISHED,
        }

        if not article.published_at:
            update_data["published_at"] = now

        article = ArticleService.update_article(
            user,
            article,
            update_data,
            revision_comment="Scheduled" if is_scheduled else "Published"
        )

        if not is_scheduled:
            trigger_webhooks(
                article.company,
                "article.published",
                {"id": str(article.id), "title": article.title, "slug": article.slug, "url": f"/artigos/{article.slug}"},
            )

            # Bug 3: notificações push via Celery (não bloqueia o worker)
            try:
                from apps.articles.tasks import notify_article_published

                notify_article_published.delay(article.id)
            except Exception:
                # Fallback síncrono se Celery não estiver disponível
                _notify_users_sync(article)

        return article

    @staticmethod
    def reject_article(user, article, reason=None):
        if article.status != Article.STATUS_PENDING:
            raise ValueError("Only pending articles can be rejected")

        # M3: rejection_reason agora é salvo no modelo
        update_data = {"status": Article.STATUS_REJECTED}
        if reason:
            update_data["rejection_reason"] = reason
        msg = "Rejected"
        if reason:
            clipped = str(reason).strip().replace("\n", " ")
            msg = f"Rejected: {clipped[:120]}"
        return ArticleService.update_article(user, article, update_data, revision_comment=msg)

    @staticmethod
    def delete_article(user, article):
        """
        Deletes an article and logs the removal.
        """
        log_delete(user, "Article", article)

        company = article.company
        article_data = {"id": str(article.id), "title": article.title}

        ArticleService._invalidate_article_cache(article)

        article.delete()

        trigger_webhooks(company, "article.deleted", article_data)

    @staticmethod
    def record_view(user, article=None, ip_address=None, article_id=None):
        from django.core.cache import cache

        target_id = article_id or (str(article.id) if article else None)
        if not target_id:
            return

        # P3: Deduplication check
        try:
            user_key = f"user:{user.id}" if user and user.is_authenticated else f"ip:{ip_address}"
            cache_key = f"article_view:{target_id}:{user_key}"
            if cache.get(cache_key):
                return
            cache.set(cache_key, True, timeout=3600)
        except Exception:
            pass

        # Dispatch async
        from .tasks import record_article_view_async

        record_article_view_async.apply_async(
            kwargs={
                "article_id": str(target_id),
                "user_id": user.id if user and getattr(user, "is_authenticated", False) else None,
                "ip_address": ip_address,
            }
        )

    @staticmethod
    def revert_to_version(user, article, version_id):
        """
        Reverts an article to a specific version ID.
        """
        import reversion
        from django.contrib.contenttypes.models import ContentType
        from reversion.models import Version

        try:
            version = Version.objects.get(pk=version_id)
        except Version.DoesNotExist:
            raise ValueError("Version not found")

        # Bug 4: valida content_type E object_id para garantir segurança
        article_ct = ContentType.objects.get_for_model(Article)
        if version.content_type_id != article_ct.id:
            raise ValueError("Version does not belong to an Article")
        if str(version.object_id) != str(article.id):
            raise ValueError("Version does not belong to this article")

        with reversion.create_revision():
            version.revert()  # Bug 4: reverte apenas esta versão, não todo o revision
            article.refresh_from_db()

            reversion.set_user(user)
            reversion.set_comment(f"Reverted to version from {version.revision.date_created}")

        from types import SimpleNamespace

        log_update(
            user,
            "Article",
            article,
            request=SimpleNamespace(company=article.company),
            changes={"reverted_to_version": version_id},
        )

        ArticleService._invalidate_article_cache(article)

        return article


def _notify_users_sync(article):
    """Fallback síncrono para notificações — usado apenas quando Celery não está disponível."""
    try:
        from apps.notifications.tasks import notify_user_push

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
                pass
    except Exception:
        pass
