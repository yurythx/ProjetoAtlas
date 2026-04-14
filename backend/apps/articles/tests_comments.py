from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Role
from apps.articles.models import Article, Category, Comment
from apps.core.models import Company
from apps.module_manager.models import Module, TenantModule
from apps.notifications.models import Notification

User = get_user_model()


class ArticleCommentsAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Comm Corp", slug="comm-corp")
        self.user = User.all_objects.create_user(
            username="commuser", email="c@corp.com", password="pass", company=self.company
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG="comm-corp")

        mod = Module.objects.create(code="articles", name="Articles")
        TenantModule.objects.create(company=self.company, module=mod, is_active=True)

        self.category = Category.objects.create(company=self.company, name="General", slug="general")
        self.article = Article.objects.create(
            company=self.company, author=self.user, title="Post", slug="post-1", content="x", category=self.category
        )

    def test_create_comment_requires_role(self):
        payload = {"article": self.article.id, "content": "Nice", "is_approved": True}
        res_forbidden = self.client.post("/api/articles/comments/", payload, format="json")
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        res_ok = self.client.post("/api/articles/comments/", payload, format="json")
        self.assertEqual(res_ok.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_ok.data["content"], "Nice")

    def test_filter_comments(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])
        self.client.post(
            "/api/articles/comments/",
            {"article": self.article.id, "content": "Nice", "is_approved": True},
            format="json",
        )
        self.client.post(
            "/api/articles/comments/",
            {"article": self.article.id, "content": "Hold", "is_approved": False},
            format="json",
        )

        res_approved = self.client.get("/api/articles/comments/?is_approved=true")
        self.assertEqual(res_approved.status_code, status.HTTP_200_OK)
        self.assertTrue(all(c["is_approved"] is True for c in res_approved.data["results"]))

    def test_approve_and_disapprove_comment(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        comment = Comment.objects.create(
            company=self.company, article=self.article, author=self.user, content="Pendente", is_approved=False
        )

        res_approve = self.client.post(f"/api/articles/comments/{comment.id}/approve/", {}, format="json")
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        comment.refresh_from_db()
        self.assertTrue(comment.is_approved)

        res_disapprove = self.client.post(f"/api/articles/comments/{comment.id}/disapprove/", {}, format="json")
        self.assertEqual(res_disapprove.status_code, status.HTTP_200_OK)
        comment.refresh_from_db()
        self.assertFalse(comment.is_approved)

    def test_bulk_actions_and_date_filters(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        c1 = Comment.objects.create(
            company=self.company, article=self.article, author=self.user, content="C1", is_approved=False
        )
        c2 = Comment.objects.create(
            company=self.company, article=self.article, author=self.user, content="C2", is_approved=False
        )

        res_bulk_approve = self.client.post(
            "/api/articles/comments/bulk_approve/", {"ids": [c1.id, c2.id]}, format="json"
        )
        self.assertEqual(res_bulk_approve.status_code, status.HTTP_200_OK)
        c1.refresh_from_db()
        c2.refresh_from_db()
        self.assertTrue(c1.is_approved)
        self.assertTrue(c2.is_approved)

        res_bulk_disapprove = self.client.post(
            "/api/articles/comments/bulk_disapprove/", {"ids": [c1.id]}, format="json"
        )
        self.assertEqual(res_bulk_disapprove.status_code, status.HTTP_200_OK)
        c1.refresh_from_db()
        self.assertFalse(c1.is_approved)

        gte = c1.created_at.isoformat()
        res_filter = self.client.get("/api/articles/comments/", {"created_at__gte": gte})
        self.assertEqual(res_filter.status_code, status.HTTP_200_OK)
        ids = [c["id"] for c in res_filter.data.get("results", [])]
        self.assertIn(c1.id, ids)
        self.assertIn(c2.id, ids)

        res_bulk_delete = self.client.post("/api/articles/comments/bulk_delete/", {"ids": [c2.id]}, format="json")
        self.assertEqual(res_bulk_delete.status_code, status.HTTP_200_OK)
        self.assertFalse(Comment.objects.filter(id=c2.id).exists())

    def test_moderation_list_includes_replies(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        parent = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Pai",
            is_public=True,
            is_approved=False,
        )
        reply = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante 2",
            content="Filho",
            is_public=True,
            is_approved=False,
            parent=parent,
        )

        res = self.client.get(
            "/api/articles/comments/", {"article": self.article.id, "is_public": True, "parent__isnull": True}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data.get("results", [])
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["id"], parent.id)
        self.assertEqual(len(data[0].get("replies", [])), 1)
        self.assertEqual(data[0]["replies"][0]["id"], reply.id)

        res_replies = self.client.get(f"/api/articles/comments/{parent.id}/replies/")
        self.assertEqual(res_replies.status_code, status.HTTP_200_OK)
        results = res_replies.data.get("results", [])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], reply.id)

    def test_bulk_filtered_actions(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        c1 = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="C1",
            is_public=True,
            is_approved=False,
        )
        c2 = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="C2",
            is_public=True,
            is_approved=False,
        )
        Comment.objects.create(
            company=self.company,
            article=self.article,
            author=self.user,
            content="Interno",
            is_public=False,
            is_approved=True,
        )

        res_approve = self.client.post(
            "/api/articles/comments/bulk_approve_filtered/",
            {"article": self.article.id, "is_public": True, "parent__isnull": True, "is_approved": False},
            format="json",
        )
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        c1.refresh_from_db()
        c2.refresh_from_db()
        self.assertTrue(c1.is_approved)
        self.assertTrue(c2.is_approved)

        res_disapprove = self.client.post(
            "/api/articles/comments/bulk_disapprove_filtered/",
            {"article": self.article.id, "is_public": True, "parent__isnull": True, "search": "C1"},
            format="json",
        )
        self.assertEqual(res_disapprove.status_code, status.HTTP_200_OK)
        c1.refresh_from_db()
        c2.refresh_from_db()
        self.assertFalse(c1.is_approved)
        self.assertTrue(c2.is_approved)

        res_delete = self.client.post(
            "/api/articles/comments/bulk_delete_filtered/",
            {"article": self.article.id, "is_public": True, "parent__isnull": True, "search": "C2"},
            format="json",
        )
        self.assertEqual(res_delete.status_code, status.HTTP_200_OK)
        self.assertFalse(Comment.objects.filter(id=c2.id).exists())

        res_count = self.client.post(
            "/api/articles/comments/bulk_filtered_count/",
            {"article": self.article.id, "is_public": True, "parent__isnull": True},
            format="json",
        )
        self.assertEqual(res_count.status_code, status.HTTP_200_OK)
        self.assertEqual(res_count.data.get("count"), 1)
        self.assertTrue(isinstance(res_count.data.get("sample_ids"), list))
        self.assertTrue(isinstance(res_count.data.get("sample_items"), list))

        parent = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Pai Include",
            is_public=True,
            is_approved=False,
        )
        child = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Filho Include",
            is_public=True,
            is_approved=False,
            parent=parent,
        )

        res_approve_with_replies = self.client.post(
            "/api/articles/comments/bulk_approve_filtered/",
            {
                "article": self.article.id,
                "is_public": True,
                "parent__isnull": True,
                "search": "Pai Include",
                "include_replies": True,
            },
            format="json",
        )
        self.assertEqual(res_approve_with_replies.status_code, status.HTTP_200_OK)
        parent.refresh_from_db()
        child.refresh_from_db()
        self.assertTrue(parent.is_approved)
        self.assertTrue(child.is_approved)

        res_count_with_replies = self.client.post(
            "/api/articles/comments/bulk_filtered_count/",
            {
                "article": self.article.id,
                "is_public": True,
                "parent__isnull": True,
                "search": "Pai Include",
                "include_replies": True,
            },
            format="json",
        )
        self.assertEqual(res_count_with_replies.status_code, status.HTTP_200_OK)
        self.assertEqual(res_count_with_replies.data.get("count"), 2)
        self.assertEqual(len(res_count_with_replies.data.get("sample_items", [])), 2)

    def test_thread_actions(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        parent = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Pai",
            is_public=True,
            is_approved=False,
        )
        r1 = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="V1",
            content="R1",
            is_public=True,
            is_approved=False,
            parent=parent,
        )
        r2 = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="V2",
            content="R2",
            is_public=True,
            is_approved=True,
            parent=parent,
        )

        res_approve = self.client.post(f"/api/articles/comments/{parent.id}/approve_thread/", {}, format="json")
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        parent.refresh_from_db()
        r1.refresh_from_db()
        r2.refresh_from_db()
        self.assertTrue(parent.is_approved)
        self.assertTrue(r1.is_approved)
        self.assertTrue(r2.is_approved)

        res_disapprove = self.client.post(f"/api/articles/comments/{parent.id}/disapprove_thread/", {}, format="json")
        self.assertEqual(res_disapprove.status_code, status.HTTP_200_OK)
        parent.refresh_from_db()
        r1.refresh_from_db()
        r2.refresh_from_db()
        self.assertFalse(parent.is_approved)
        self.assertFalse(r1.is_approved)
        self.assertFalse(r2.is_approved)

        res_delete = self.client.post(f"/api/articles/comments/{parent.id}/delete_thread/", {}, format="json")
        self.assertEqual(res_delete.status_code, status.HTTP_200_OK)
        self.assertFalse(Comment.objects.filter(id=parent.id).exists())
        self.assertFalse(Comment.objects.filter(id=r1.id).exists())
        self.assertFalse(Comment.objects.filter(id=r2.id).exists())

    def test_reply_approval_notifies_parent_author(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        parent_author = User.all_objects.create_user(
            username="parent-author", email="parent@author.com", password="pass", company=self.company
        )
        parent = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=parent_author,
            content="Comentário do autor",
            is_public=True,
            is_approved=True,
        )
        reply = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Resposta pendente",
            is_public=True,
            is_approved=False,
            parent=parent,
        )

        res_approve = self.client.post(f"/api/articles/comments/{reply.id}/approve/", {}, format="json")
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        self.assertTrue(
            Notification.objects.filter(
                company=self.company, recipient=parent_author, title="Nova resposta ao seu comentário"
            ).exists()
        )

    def test_approve_thread_notification_aggregates_for_parent_author(self):
        cache.clear()
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        parent_author = User.all_objects.create_user(
            username="parent-author-2", email="parent2@author.com", password="pass", company=self.company
        )
        parent = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=parent_author,
            content="Comentário do autor 2",
            is_public=True,
            is_approved=True,
        )
        Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="R1",
            is_public=True,
            is_approved=False,
            parent=parent,
        )

        res_approve1 = self.client.post(f"/api/articles/comments/{parent.id}/approve_thread/", {}, format="json")
        self.assertEqual(res_approve1.status_code, status.HTTP_200_OK)
        qs = Notification.objects.filter(
            company=self.company, recipient=parent_author, title="Novas respostas ao seu comentário"
        )
        self.assertEqual(qs.count(), 1)
        self.assertTrue("1 resposta(s) foram aprovadas" in (qs.first().message or ""))

        cache.clear()
        Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="R2 mais recente",
            is_public=True,
            is_approved=False,
            parent=parent,
        )
        res_approve2 = self.client.post(f"/api/articles/comments/{parent.id}/approve_thread/", {}, format="json")
        self.assertEqual(res_approve2.status_code, status.HTTP_200_OK)

        qs2 = Notification.objects.filter(
            company=self.company, recipient=parent_author, title="Novas respostas ao seu comentário"
        )
        self.assertEqual(qs2.count(), 1)
        msg = qs2.first().message or ""
        self.assertTrue("2 resposta(s) foram aprovadas" in msg)
        self.assertTrue("R2 mais recente" in msg)

    def test_moderation_metrics_endpoint(self):
        role, _ = Role.all_objects.get_or_create(
            company=self.company, name="Editor", defaults={"permissions": ["articles.comment_moderate"]}
        )
        if role.permissions != ["articles.comment_moderate"]:
            role.permissions = ["articles.comment_moderate"]
            role.save(update_fields=["permissions"])
        self.user.role = role
        self.user.save(update_fields=["role"])

        parent = Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Pendente",
            is_public=True,
            is_approved=False,
        )
        Comment.objects.create(
            company=self.company,
            article=self.article,
            author=None,
            name="Visitante",
            content="Resposta pendente",
            is_public=True,
            is_approved=False,
            parent=parent,
        )

        res = self.client.get("/api/articles/comments/moderation_metrics/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("pending_articles"), 0)
        self.assertEqual(res.data.get("pending_comments"), 1)
        self.assertEqual(res.data.get("pending_replies"), 1)
        self.assertEqual(res.data.get("pending_total"), 2)
        self.assertEqual(res.data.get("pending_total_all"), 2)
        self.assertTrue(isinstance(res.data.get("top_articles"), list))

        res2 = self.client.get("/api/articles/articles/moderation_metrics/")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data.get("pending_articles"), 0)
