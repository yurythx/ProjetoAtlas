from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Role
from apps.articles.models import Article, Category, Comment, Tag
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule

User = get_user_model()


class ArticlesAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Corp", slug="test-corp")
        # Basic user
        self.user = User.all_objects.create_user(
            username="tester", email="tester@test.corp", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="test-corp")

        # Modules
        self.mod_articles = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company, module=self.mod_articles, is_active=True)

        # Data
        self.cat = Category.objects.create(name="Tech", slug="tech", company=self.company)
        self.tag = Tag.objects.create(name="Python", slug="python", company=self.company)

    def test_read_endpoints_without_role(self):
        # Articles list requires 'articles.article_view' permission — 403 without role
        self.user.role = None
        self.user.save(update_fields=["role"])
        res = self.client.get("/api/articles/articles/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Assign role and retry — now should succeed
        role, _ = Role.objects.get_or_create(
            company=self.company, name="Reader", defaults={"permissions": ["articles.article_view"]}
        )
        self.user.role = role
        self.user.save(update_fields=["role"])

        res = self.client.get("/api/articles/articles/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # List categories (also requires module access + role with articles.category_manage)
        # Note: TagViewSet requires 'articles.category_manage'
        res = self.client.get("/api/articles/categories/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Update role to include category_manage
        role.permissions.append("articles.category_manage")
        role.save()

        res = self.client.get("/api/articles/categories/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_write_without_role(self):
        # Attempt to create article without role — RBAC blocks with 403
        payload = {
            "title": "News 1",
            "slug": "news-api-1",
            "content": "Extra extra!",
            "status": "draft",
            "category": self.cat.id,
            "tags": [self.tag.id],
        }
        res = self.client.post("/api/articles/articles/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Assign role with permission and retry — now should succeed
        role, _ = Role.objects.get_or_create(
            company=self.company,
            name="Editor",
            defaults={"permissions": ["articles.article_view", "articles.article_create"]},
        )
        self.user.role = role
        self.user.save(update_fields=["role"])

        payload["slug"] = "news-api-1-with-role"
        res = self.client.post("/api/articles/articles/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["title"], "News 1")

        # Create another article with different slug
        payload2 = dict(payload)
        payload2["title"] = "News 2"
        payload2["slug"] = "news-api-2"
        res2 = self.client.post("/api/articles/articles/", payload2, format="json")
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

    def test_module_disabled_blocks_access(self):
        # Disable module
        tm = TenantModule.all_objects.get(company=self.company, module=self.mod_articles)
        tm.is_active = False
        tm.save(update_fields=["is_active"])

        res = self.client.get("/api/articles/articles/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_bulk_publish_and_reject(self):
        role, _ = Role.objects.get_or_create(
            company=self.company,
            name="Publisher",
            defaults={"permissions": ["articles.article_view", "articles.article_create", "articles.article_publish"]},
        )
        self.user.role = role
        self.user.save(update_fields=["role"])

        a1 = Article.objects.create(
            company=self.company,
            title="A1",
            slug="a1",
            content="x",
            status=Article.STATUS_PENDING,
        )
        a2 = Article.objects.create(
            company=self.company,
            title="A2",
            slug="a2",
            content="x",
            status=Article.STATUS_PENDING,
        )

        res_reject = self.client.post(
            "/api/articles/articles/bulk/reject/",
            {"slugs": [a1.slug, a2.slug], "reason": "Não atende a política"},
            format="json",
        )
        self.assertEqual(res_reject.status_code, status.HTTP_200_OK)
        a1.refresh_from_db()
        a2.refresh_from_db()
        self.assertEqual(a1.status, Article.STATUS_REJECTED)
        self.assertEqual(a2.status, Article.STATUS_REJECTED)
        self.assertTrue(a1.rejection_reason)
        self.assertTrue(a2.rejection_reason)

        a3 = Article.objects.create(
            company=self.company,
            title="A3",
            slug="a3",
            content="x",
            status=Article.STATUS_PENDING,
        )
        a4 = Article.objects.create(
            company=self.company,
            title="A4",
            slug="a4",
            content="x",
            status=Article.STATUS_PENDING,
        )

        res_publish = self.client.post(
            "/api/articles/articles/bulk/publish/",
            {"slugs": [a3.slug, a4.slug]},
            format="json",
        )
        self.assertEqual(res_publish.status_code, status.HTTP_200_OK)
        a3.refresh_from_db()
        a4.refresh_from_db()
        self.assertEqual(a3.status, Article.STATUS_PUBLISHED)
        self.assertEqual(a4.status, Article.STATUS_PUBLISHED)

    def test_article_moderation_metrics_endpoint(self):
        role, _ = Role.objects.get_or_create(
            company=self.company,
            name="Viewer",
            defaults={"permissions": ["articles.article_view"]},
        )
        self.user.role = role
        self.user.save(update_fields=["role"])

        Article.objects.create(
            company=self.company,
            title="Pendente",
            slug="pendente",
            content="x",
            status=Article.STATUS_PENDING,
        )

        res = self.client.get("/api/articles/articles/moderation_metrics/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("pending_articles"), 1)


class PublicArticlesAPITest(APITestCase):
    def setUp(self):
        cache.clear()
        # Tenants
        self.company_a = Company.objects.create(name="Alpha", slug="alpha")
        self.company_b = Company.objects.create(name="Beta", slug="beta")

        mod = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company_a, module=mod, is_active=True)
        TenantModule.objects.create(company=self.company_b, module=mod, is_active=True)

        role_a, _ = Role.all_objects.get_or_create(
            company=self.company_a, name="Moderator", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role_a.permissions != ["articles.comment_moderate"]:
            role_a.permissions = ["articles.comment_moderate"]
            role_a.save(update_fields=["permissions"])
        self.moderator_a = User.all_objects.create_user(
            username="moda", email="moda@alpha.com", password="pass", company=self.company_a, role=role_a
        )

        # Categories
        self.cat_a = Category.objects.create(name="Tech", slug="tech", company=self.company_a)
        self.cat_b = Category.objects.create(name="News", slug="news", company=self.company_b)

        # Articles (public/published)
        self.art_a = Article.objects.create(
            company=self.company_a,
            title="Artigo Público Alpha",
            slug="artigo-publico-alpha",
            content="<p>Alpha content</p>",
            excerpt="Alpha excerpt",
            status=Article.STATUS_PUBLISHED,
            is_public=True,
        )
        self.art_b = Article.objects.create(
            company=self.company_b,
            title="Artigo Público Beta",
            slug="artigo-publico-beta",
            content="<p>Beta content</p>",
            excerpt="Beta excerpt",
            status=Article.STATUS_PUBLISHED,
            is_public=True,
        )
        # Garantir published_at para inclusão no queryset público
        from django.utils import timezone

        self.art_a.published_at = timezone.now()
        self.art_b.published_at = timezone.now()
        self.art_a.save(update_fields=["published_at"])
        self.art_b.save(update_fields=["published_at"])

        # Clients
        self.public_client = APIClient()
        # Reset simple rate limit cache keys used by PublicCommentViewSet
        cache.delete("rate:pub_comment:alpha:127.0.0.1")
        cache.delete("rate:pub_comment:beta:127.0.0.1")
        # Reset article view deduplication cache keys to avoid cross-test pollution
        cache.clear()

    def test_public_list_filters_by_company(self):
        # Without tenant context, both slugs must be accessible via retrieve
        res_alpha_det = self.public_client.get(f"/api/articles/public/articles/{self.art_a.slug}/")
        res_beta_det = self.public_client.get(f"/api/articles/public/articles/{self.art_b.slug}/")
        self.assertEqual(res_alpha_det.status_code, status.HTTP_200_OK)
        self.assertEqual(res_beta_det.status_code, status.HTTP_200_OK)

        # With tenant header, should list only that company
        res_alpha = self.public_client.get("/api/articles/public/articles/", HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res_alpha.status_code, status.HTTP_200_OK)
        data_alpha = res_alpha.data if isinstance(res_alpha.data, list) else res_alpha.data.get("results", [])
        slugs_alpha = [a["slug"] for a in data_alpha]
        self.assertIn(self.art_a.slug, slugs_alpha)
        self.assertNotIn(self.art_b.slug, slugs_alpha)

        res_beta = self.public_client.get("/api/articles/public/articles/", HTTP_X_COMPANY_SLUG="beta")
        self.assertEqual(res_beta.status_code, status.HTTP_200_OK)
        data_beta = res_beta.data if isinstance(res_beta.data, list) else res_beta.data.get("results", [])
        slugs_beta = [a["slug"] for a in data_beta]
        self.assertIn(self.art_b.slug, slugs_beta)
        self.assertNotIn(self.art_a.slug, slugs_beta)

    def test_public_retrieve_by_slug(self):
        # Retrieve with tenant header
        res = self.public_client.get(f"/api/articles/public/articles/{self.art_a.slug}/", HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["slug"], self.art_a.slug)
        self.assertEqual(res.data["title"], self.art_a.title)
        self.assertEqual(res.data.get("company_slug"), self.company_a.slug)
        self.assertIn("excerpt", res.data)
        self.assertIn("content", res.data)

    def test_public_categories_lists_only_used_categories(self):
        self.art_a.category = self.cat_a
        self.art_a.save(update_fields=["category"])
        self.art_b.category = self.cat_b
        self.art_b.save(update_fields=["category"])

        res_alpha = self.public_client.get("/api/articles/public/categories/", HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res_alpha.status_code, status.HTTP_200_OK)
        data_alpha = res_alpha.data if isinstance(res_alpha.data, list) else res_alpha.data.get("results", [])
        ids_alpha = [c["id"] for c in data_alpha]
        self.assertIn(self.cat_a.id, ids_alpha)
        self.assertNotIn(self.cat_b.id, ids_alpha)

        res_beta = self.public_client.get("/api/articles/public/categories/", HTTP_X_COMPANY_SLUG="beta")
        self.assertEqual(res_beta.status_code, status.HTTP_200_OK)
        data_beta = res_beta.data if isinstance(res_beta.data, list) else res_beta.data.get("results", [])
        ids_beta = [c["id"] for c in data_beta]
        self.assertIn(self.cat_b.id, ids_beta)
        self.assertNotIn(self.cat_a.id, ids_beta)

    def test_public_comment_rejects_link_spam(self):
        payload = {
            "article_slug": self.art_a.slug,
            "name": "Visitante",
            "email": "spam@example.com",
            "content": "Veja http://a.com http://b.com http://c.com",
        }
        res = self.public_client.post(
            "/api/articles/public/comments/", payload, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_comments_create_and_list_with_moderation_and_rate_limit(self):
        # Initially, list should be empty (no approved comments)
        res_list_empty = self.public_client.get(
            "/api/articles/public/comments/", {"article_slug": self.art_a.slug}, HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_list_empty.status_code, status.HTTP_200_OK)
        data_empty = (
            res_list_empty.data if isinstance(res_list_empty.data, list) else res_list_empty.data.get("results", [])
        )
        self.assertEqual(len(data_empty), 0)

        # Post a public comment (pending moderation)
        payload = {
            "article_slug": self.art_a.slug,
            "name": "Visitante",
            "email": "visitante@example.com",
            "content": "Ótimo artigo!",
        }
        res_create = self.public_client.post(
            "/api/articles/public/comments/", payload, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        created_id = res_create.data.get("id")
        comment = Comment.objects.get(id=created_id)
        self.assertFalse(comment.is_approved)
        self.assertTrue(comment.is_public)
        self.assertEqual(comment.company, self.company_a)
        from apps.notifications.models import Notification

        self.assertTrue(
            Notification.objects.filter(company=self.company_a, recipient=self.moderator_a, is_read=False).exists()
        )

        # After creation, list remains empty until approved
        res_list_after = self.public_client.get(
            "/api/articles/public/comments/", {"article_slug": self.art_a.slug}, HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_list_after.status_code, status.HTTP_200_OK)
        data_after = (
            res_list_after.data if isinstance(res_list_after.data, list) else res_list_after.data.get("results", [])
        )
        self.assertEqual(len(data_after), 0)

        # Approve and then list should include it
        comment.is_approved = True
        comment.save(update_fields=["is_approved"])
        res_list_approved = self.public_client.get(
            "/api/articles/public/comments/", {"article_slug": self.art_a.slug}, HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_list_approved.status_code, status.HTTP_200_OK)
        data_approved = (
            res_list_approved.data
            if isinstance(res_list_approved.data, list)
            else res_list_approved.data.get("results", [])
        )
        self.assertEqual(len(data_approved), 1)
        self.assertEqual(data_approved[0]["content"], "Ótimo artigo!")
        self.assertEqual(data_approved[0].get("replies", []), [])

        # Reply to the approved public comment
        payload_reply = {
            "article_slug": self.art_a.slug,
            "parent": created_id,
            "name": "Visitante 2",
            "email": "visitante2@example.com",
            "content": "Concordo!",
        }
        res_reply = self.public_client.post(
            "/api/articles/public/comments/", payload_reply, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_reply.status_code, status.HTTP_201_CREATED)
        reply_id = res_reply.data.get("id")
        reply = Comment.objects.get(id=reply_id)
        reply.is_approved = True
        reply.save(update_fields=["is_approved"])

        res_list_with_reply = self.public_client.get(
            "/api/articles/public/comments/", {"article_slug": self.art_a.slug}, HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_list_with_reply.status_code, status.HTTP_200_OK)
        data_with_reply = (
            res_list_with_reply.data
            if isinstance(res_list_with_reply.data, list)
            else res_list_with_reply.data.get("results", [])
        )
        self.assertEqual(len(data_with_reply), 1)
        self.assertEqual(len(data_with_reply[0].get("replies", [])), 1)
        self.assertEqual(data_with_reply[0]["replies"][0]["content"], "Concordo!")

        res_replies = self.public_client.get(
            f"/api/articles/public/comments/{created_id}/replies/", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_replies.status_code, status.HTTP_200_OK)
        reply_results = res_replies.data.get("results", [])
        self.assertEqual(len(reply_results), 1)
        self.assertEqual(reply_results[0]["content"], "Concordo!")
        from apps.notifications.models import Notification

        self.assertTrue(
            Notification.objects.filter(
                company=self.company_a, recipient=self.moderator_a, title="Nova resposta pendente"
            ).exists()
        )

        # Test rate limit: 6 quick posts should yield 429 on the 6th
        # Considering initial create + reply counts as 2, allow only 3 more before rate limit (max=5)
        for i in range(3):
            pl = dict(payload)
            pl["content"] = f"Outro comentário {i}"
            pl["email"] = f"visitante{i}@example.com"
            res_ok = self.public_client.post(
                "/api/articles/public/comments/", pl, format="json", HTTP_X_COMPANY_SLUG="alpha"
            )
            self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        pl_over = dict(payload)
        pl_over["content"] = "Limite"
        res_over = self.public_client.post(
            "/api/articles/public/comments/", pl_over, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_over.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_public_comment_notification_cooldown(self):
        from apps.notifications.models import Notification

        payload = {
            "article_slug": self.art_a.slug,
            "name": "Visitante",
            "email": "cooldown1@example.com",
            "content": "Primeiro",
        }
        res1 = self.public_client.post(
            "/api/articles/public/comments/", payload, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        cache.clear()

        payload2 = dict(payload)
        payload2["email"] = "cooldown2@example.com"
        payload2["content"] = "Segundo"
        res2 = self.public_client.post(
            "/api/articles/public/comments/", payload2, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)

        qs = Notification.objects.filter(company=self.company_a, recipient=self.moderator_a)
        self.assertEqual(qs.count(), 1)
        n = qs.first()
        self.assertTrue("2 comentários pendentes" in (n.message or ""))

    def test_public_retrieve_records_view(self):
        # No views initially
        from apps.articles.models import ArticleView

        self.assertEqual(ArticleView.objects.filter(article=self.art_a).count(), 0)
        # Retrieve should record a view (anonymous)
        res = self.public_client.get(f"/api/articles/public/articles/{self.art_a.slug}/", HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(ArticleView.objects.filter(article=self.art_a).count(), 1)
        view = ArticleView.objects.filter(article=self.art_a).first()
        self.assertEqual(view.company, self.company_a)
        self.assertIsNone(view.user)
        self.assertIsNotNone(view.viewed_at)

    def test_public_list_filters_by_query_company_slug(self):
        # Using query param company_slug should filter
        res_alpha = self.public_client.get("/api/articles/public/articles/?company_slug=alpha")
        self.assertEqual(res_alpha.status_code, status.HTTP_200_OK)
        data_alpha = res_alpha.data if isinstance(res_alpha.data, list) else res_alpha.data.get("results", [])
        slugs_alpha = [a["slug"] for a in data_alpha]
        self.assertIn(self.art_a.slug, slugs_alpha)
        self.assertNotIn(self.art_b.slug, slugs_alpha)

    def test_public_comments_invalid_article_slug(self):
        payload = {"article_slug": "inexistente", "name": "Visitante", "email": "v@example.com", "content": "Teste"}
        res = self.public_client.post(
            "/api/articles/public/comments/", payload, format="json", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_comments_list_respects_company(self):
        # Create approved comment for alpha article
        from apps.articles.models import Comment

        Comment.objects.create(article=self.art_a, company=self.company_a, content="Aprovado Alpha", is_approved=True)
        # Listing in beta should not include
        res_beta = self.public_client.get(
            "/api/articles/public/comments/", {"article_slug": self.art_a.slug}, HTTP_X_COMPANY_SLUG="beta"
        )
        self.assertEqual(res_beta.status_code, status.HTTP_200_OK)
        data_beta = res_beta.data if isinstance(res_beta.data, list) else res_beta.data.get("results", [])
        self.assertEqual(len(data_beta), 0)

    def test_public_search_by_title(self):
        # SearchFilter: ?search=Alpha should return only alpha article
        res_search_alpha = self.public_client.get("/api/articles/public/articles/?search=Alpha")
        self.assertEqual(res_search_alpha.status_code, status.HTTP_200_OK)
        data = (
            res_search_alpha.data
            if isinstance(res_search_alpha.data, list)
            else res_search_alpha.data.get("results", [])
        )
        slugs = [a["slug"] for a in data]
        self.assertIn(self.art_a.slug, slugs)
        self.assertNotIn(self.art_b.slug, slugs)

    def test_public_ordering_by_published_at(self):
        # Make published_at different to test ordering
        from django.utils import timezone

        self.art_a.published_at = timezone.now() - timezone.timedelta(minutes=5)
        self.art_b.published_at = timezone.now()
        self.art_a.save(update_fields=["published_at"])
        self.art_b.save(update_fields=["published_at"])
        # Default ordering is -published_at (desc): art_b first
        res_default = self.public_client.get("/api/articles/public/articles/")
        self.assertEqual(res_default.status_code, status.HTTP_200_OK)
        data_default = res_default.data if isinstance(res_default.data, list) else res_default.data.get("results", [])
        slugs_default = [a["slug"] for a in data_default]
        self.assertGreaterEqual(len(slugs_default), 2)
        self.assertEqual(slugs_default[0], self.art_b.slug)
        # Ascending ordering by ?ordering=published_at: art_a first
        res_asc = self.public_client.get("/api/articles/public/articles/?ordering=published_at")
        self.assertEqual(res_asc.status_code, status.HTTP_200_OK)
        data_asc = res_asc.data if isinstance(res_asc.data, list) else res_asc.data.get("results", [])
        slugs_asc = [a["slug"] for a in data_asc]
        self.assertGreaterEqual(len(slugs_asc), 2)
        self.assertEqual(slugs_asc[0], self.art_a.slug)

    def test_public_serializer_seo_fields(self):
        # Set meta fields and ensure they are present in public serializer
        self.art_a.meta_title = "Meta Alpha"
        self.art_a.meta_description = "Descrição curta para SEO"
        self.art_a.save(update_fields=["meta_title", "meta_description"])
        res = self.public_client.get(f"/api/articles/public/articles/{self.art_a.slug}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("meta_title"), "Meta Alpha")
        self.assertEqual(res.data.get("meta_description"), "Descrição curta para SEO")

    def test_public_filter_combined(self):
        # Category + Search + Ordering
        # Art A: Tech, "Alpha", older
        # Art B: News, "Beta", newer

        from django.utils import timezone

        # Ensure art_a is setup correctly (category and time)
        self.art_a.category = self.cat_a
        self.art_a.published_at = timezone.now() - timezone.timedelta(hours=2)
        self.art_a.save(update_fields=["category", "published_at"])

        art_c = Article.objects.create(
            company=self.company_a,
            title="Artigo Público Alpha Extra",
            slug="artigo-publico-alpha-extra",
            content="Conteúdo Alpha Extra",
            excerpt="Resumo Alpha Extra",
            category=self.cat_a,
            status=Article.STATUS_PUBLISHED,
            is_public=True,
            published_at=timezone.now() - timezone.timedelta(hours=1),
        )

        # Filter: Category Tech (cat_a) + Search "Alpha" + Order -published_at
        # art_c (-1h) is newer than art_a (-2h).
        # Order should be art_c, then art_a.
        url = f"/api/articles/public/articles/?category={self.cat_a.id}&search=Alpha&ordering=-published_at"
        res = self.public_client.get(url, HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        slugs = [a["slug"] for a in data]

        self.assertEqual(len(slugs), 2, f"Expected 2 articles, got {len(slugs)}. Slugs: {slugs}")
        self.assertEqual(slugs[0], art_c.slug)
        self.assertEqual(slugs[1], self.art_a.slug)

    def test_public_filter_multiple_tags(self):
        # Create tags
        tag1 = Tag.objects.create(name="Tag1", slug="tag1", company=self.company_a)
        tag2 = Tag.objects.create(name="Tag2", slug="tag2", company=self.company_a)

        # Art A: Tag1
        self.art_a.tags.add(tag1)

        # Create Art C: Tag2
        from django.utils import timezone

        art_c = Article.objects.create(
            company=self.company_a,
            title="Artigo C",
            slug="art-c",
            content="C",
            status=Article.STATUS_PUBLISHED,
            is_public=True,
            published_at=timezone.now(),
        )
        art_c.tags.add(tag2)

        # Create Art D: Tag1 & Tag2
        art_d = Article.objects.create(
            company=self.company_a,
            title="Artigo D",
            slug="art-d",
            content="D",
            status=Article.STATUS_PUBLISHED,
            is_public=True,
            published_at=timezone.now(),
        )
        art_d.tags.add(tag1, tag2)

        # Filter Tag1: Art A, Art D
        res1 = self.public_client.get(f"/api/articles/public/articles/?tags={tag1.id}", HTTP_X_COMPANY_SLUG="alpha")
        slugs1 = [a["slug"] for a in res1.data.get("results", [])]
        self.assertIn(self.art_a.slug, slugs1)
        self.assertIn(art_d.slug, slugs1)
        self.assertNotIn(art_c.slug, slugs1)

        # Filter Tag2: Art C, Art D
        res2 = self.public_client.get(f"/api/articles/public/articles/?tags={tag2.id}", HTTP_X_COMPANY_SLUG="alpha")
        slugs2 = [a["slug"] for a in res2.data.get("results", [])]
        self.assertIn(art_c.slug, slugs2)
        self.assertIn(art_d.slug, slugs2)
        self.assertNotIn(self.art_a.slug, slugs2)

    def test_public_pagination_consistency(self):
        # Create 15 articles with distinct timestamps
        from django.utils import timezone

        base_time = timezone.now()

        # Delete existing to start clean for this test or just add more
        Article.all_objects.filter(company=self.company_a).delete()

        articles = []
        for i in range(15):
            articles.append(
                Article(
                    company=self.company_a,
                    title=f"Art {i}",
                    slug=f"art-{i}",
                    content="Content",
                    status=Article.STATUS_PUBLISHED,
                    is_public=True,
                    published_at=base_time - timezone.timedelta(minutes=i),  # Art 0 newest, Art 14 oldest
                )
            )
        Article.objects.bulk_create(articles)

        # Page 1: Should have 10 articles (Art 0 to Art 9)
        res_p1 = self.public_client.get(
            "/api/articles/public/articles/?page=1&ordering=-published_at", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_p1.status_code, status.HTTP_200_OK)
        results_p1 = res_p1.data.get("results", [])
        self.assertEqual(len(results_p1), 10)
        self.assertEqual(results_p1[0]["slug"], "art-0")
        self.assertEqual(results_p1[9]["slug"], "art-9")

        # Page 2: Should have 5 articles (Art 10 to Art 14)
        res_p2 = self.public_client.get(
            "/api/articles/public/articles/?page=2&ordering=-published_at", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_p2.status_code, status.HTTP_200_OK)
        results_p2 = res_p2.data.get("results", [])
        self.assertEqual(len(results_p2), 5)
        self.assertEqual(results_p2[0]["slug"], "art-10")
        self.assertEqual(results_p2[4]["slug"], "art-14")

    def test_public_search_by_content(self):
        res = self.public_client.get("/api/articles/public/articles/?search=Beta")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        slugs = [a["slug"] for a in data]
        self.assertIn(self.art_b.slug, slugs)
        self.assertNotIn(self.art_a.slug, slugs)

    def test_public_pagination(self):
        from django.utils import timezone

        for i in range(12):
            Article.objects.create(
                company=self.company_a,
                title=f"Alpha {i}",
                slug=f"alpha-{i}",
                content="<p>X</p>",
                excerpt="x",
                status=Article.STATUS_PUBLISHED,
                is_public=True,
                published_at=timezone.now(),
            )
        res_page1 = self.public_client.get("/api/articles/public/articles/", HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res_page1.status_code, status.HTTP_200_OK)
        data1 = res_page1.data if isinstance(res_page1.data, list) else res_page1.data.get("results", [])
        self.assertLessEqual(len(data1), 10)
        res_page2 = self.public_client.get("/api/articles/public/articles/?page=2", HTTP_X_COMPANY_SLUG="alpha")
        self.assertEqual(res_page2.status_code, status.HTTP_200_OK)
        data2 = res_page2.data if isinstance(res_page2.data, list) else res_page2.data.get("results", [])
        self.assertGreaterEqual(len(data2), 1)

    def test_public_pagination_with_query_company_slug(self):
        from django.utils import timezone

        for i in range(11):
            Article.objects.create(
                company=self.company_a,
                title=f"Alpha Q {i}",
                slug=f"alpha-q-{i}",
                content="<p>X</p>",
                excerpt="x",
                status=Article.STATUS_PUBLISHED,
                is_public=True,
                published_at=timezone.now(),
            )
        res_page1 = self.public_client.get("/api/articles/public/articles/?company_slug=alpha")
        self.assertEqual(res_page1.status_code, status.HTTP_200_OK)
        data1 = res_page1.data if isinstance(res_page1.data, list) else res_page1.data.get("results", [])
        self.assertLessEqual(len(data1), 10)
        res_page2 = self.public_client.get("/api/articles/public/articles/?company_slug=alpha&page=2")
        self.assertEqual(res_page2.status_code, status.HTTP_200_OK)
        data2 = res_page2.data if isinstance(res_page2.data, list) else res_page2.data.get("results", [])
        self.assertGreaterEqual(len(data2), 1)

    def test_public_filter_by_category_id(self):
        self.art_a.category = self.cat_a
        self.art_a.save(update_fields=["category"])
        self.art_b.category = self.cat_b
        self.art_b.save(update_fields=["category"])
        res = self.public_client.get(
            f"/api/articles/public/articles/?category={self.cat_a.id}", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data if isinstance(res.data, list) else res.data.get("results", [])
        slugs = [a["slug"] for a in data]
        self.assertIn(self.art_a.slug, slugs)
        self.assertNotIn(self.art_b.slug, slugs)

    def test_public_filter_by_tag_id(self):
        t_alpha = Tag.objects.create(name="AlphaTag", slug="alpha-tag", company=self.company_a)
        t_beta = Tag.objects.create(name="BetaTag", slug="beta-tag", company=self.company_b)
        self.art_a.tags.add(t_alpha)
        self.art_b.tags.add(t_beta)
        res_alpha_tag = self.public_client.get(
            f"/api/articles/public/articles/?tags={t_alpha.id}", HTTP_X_COMPANY_SLUG="alpha"
        )
        self.assertEqual(res_alpha_tag.status_code, status.HTTP_200_OK)
        data_alpha_tag = (
            res_alpha_tag.data if isinstance(res_alpha_tag.data, list) else res_alpha_tag.data.get("results", [])
        )
        slugs_alpha_tag = [a["slug"] for a in data_alpha_tag]
        self.assertIn(self.art_a.slug, slugs_alpha_tag)
        self.assertNotIn(self.art_b.slug, slugs_alpha_tag)
