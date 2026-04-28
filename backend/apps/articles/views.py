from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import filters, mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import ActionRolePermission, AnyRolePermission, HasRolePermission
from apps.module_manager.models import TenantModule
from apps.module_manager.permissions import HasModuleAccess
from shared_kernel.audit import log_create, log_delete, log_update

from .filters import ArticleFilter, PublicArticleFilter
from .models import Article, ArticleView, Category, Comment, Tag
from .serializers import (
    ArticleAnalyticsSerializer,
    ArticlePublicSerializer,
    ArticleSerializer,
    CategorySerializer,
    CommentSerializer,
    GlobalArticlesAnalyticsSerializer,
    ModerationCommentSerializer,
    ModerationReplySerializer,
    PublicCategorySerializer,
    PublicCommentSerializer,
    PublicReplySerializer,
    TagSerializer,
)
from .services import ArticleService


@extend_schema_view(
    list=extend_schema(tags=["Public Articles"], description="Lista categorias com artigos públicos publicados"),
)
class PublicCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PublicCategorySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None
    ordering_fields = ["name"]
    ordering = ["name"]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_articles"

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        qs = Category.all_objects.all()

        if company:
            qs = qs.filter(company=company)
        else:
            company_slug = self.request.query_params.get("company_slug") or self.request.headers.get("X-Company-Slug")
            if company_slug:
                qs = qs.filter(company__slug=company_slug)
            else:
                return Category.all_objects.none()

        return qs.order_by("name")


@extend_schema_view(
    list=extend_schema(tags=["Public Articles"], description="Lista artigos públicos sem necessidade de autenticação"),
    retrieve=extend_schema(tags=["Public Articles"], description="Detalhe de artigo público"),
)
class PublicArticleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet público - sem autenticação requerida.
    Retorna apenas artigos marcados como públicos (is_public=True) e publicados.
    """

    serializer_class = ArticlePublicSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "slug"
    lookup_url_kwarg = "slug"
    filterset_class = PublicArticleFilter
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "content", "excerpt"]
    ordering_fields = ["published_at", "created_at"]
    ordering = ["-published_at"]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_articles"

    def get_queryset(self):
        """
        Retorna artigos publicados.
        - Usuários anônimos: apenas públicos.
        - Usuários autenticados (do mesmo tenant): públicos e privados.
        """
        company = getattr(self.request, "company", None)

        # Base query: apenas publicados e com data de publicação já alcançada
        # Usamos all_objects para poder filtrar manualmente o tenant se necessário (ex: acesso via slug público)
        from django.utils import timezone
        qs = Article.all_objects.filter(
            status=Article.STATUS_PUBLISHED,
            published_at__isnull=False,
            published_at__lte=timezone.now()
        )

        # Se usuário autenticado e no contexto da sua empresa, vê privados também
        user = self.request.user
        is_same_tenant = user.is_authenticated and company and getattr(user, "company_id", None) == company.id

        if not is_same_tenant:
            qs = qs.filter(is_public=True)

        # Tenant filtering logic:
        # 1. Try to get explicit tenant from query params or headers
        company_slug = self.request.query_params.get("company_slug") or self.request.headers.get("X-Company-Slug")
        
        if company_slug:
            qs = qs.filter(company__slug=company_slug)
        elif company:
            # Se temos uma empresa identificada pelo middleware (Host ou Fallback)
            # Mas espera: se for o fallback 'raiz', queremos mostrar TUDO ou apenas Raiz?
            # Se o usuário está acessando via um domínio específico (Host), filtramos por essa empresa.
            # Se ele está no domínio principal (onde o fallback 'raiz' acontece), mostramos TUDO que é público.
            
            # Verificamos se a empresa foi identificada "explicitamente" ou se é o fallback 'raiz'
            # Uma forma simples é ver se o Host bate com o domínio da empresa ou se temos o slug.
            # Para simplificar e garantir visibilidade: se não houver slug explícito nem host-matching forte,
            # e a empresa for 'raiz', não filtramos por empresa para permitir a visão global.
            
            host = self.request.get_host().split(":")[0]
            is_explicit_host = company.domain and host.lower() == company.domain.lower()
            
            if is_explicit_host or company.slug != "raiz":
                qs = qs.filter(company=company)
            # else: vision global (não filtra por company)
        
        return (
            qs.select_related("category", "author", "company")
            .prefetch_related("tags")
            .annotate(comment_count=Count("comments", filter=Q(comments__is_public=True, comments__is_approved=True)))
            .order_by("-published_at")
        )

    def retrieve(self, request, *args, **kwargs):
        slug = kwargs.get("slug")
        company = getattr(request, "company", None)
        c_slug = company.slug if company else "public"
        cache_key = f"art_p_det:{c_slug}:{slug}"

        cached = cache.get(cache_key)
        if cached:
            ArticleService.record_view(None, article_id=cached.get("id"), ip_address=request.META.get("REMOTE_ADDR"))
            return Response(cached)

        try:
            instance = self.get_object()
        except Article.MultipleObjectsReturned:
            hint = request.query_params.get("company_slug") or request.headers.get("X-Company-Slug")
            if not hint:
                return Response(
                    {
                        "detail": "Mais de um artigo encontrado com este slug. Informe company_slug na URL.",
                        "code": "ambiguous_slug",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            return Response(
                {
                    "detail": "Slug duplicado para este tenant. Ajuste o slug ou verifique o cadastro.",
                    "code": "duplicate_slug",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        ArticleService.record_view(
            request.user if request.user.is_authenticated else None, instance, request.META.get("REMOTE_ADDR")
        )
        data = self.get_serializer(instance).data
        cache.set(cache_key, data, timeout=300)
        return Response(data)


@extend_schema_view(
    list=extend_schema(tags=["Articles"]),
    retrieve=extend_schema(tags=["Articles"]),
    create=extend_schema(tags=["Articles"]),
    update=extend_schema(tags=["Articles"]),
    partial_update=extend_schema(tags=["Articles"]),
    destroy=extend_schema(tags=["Articles"]),
)
class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasRolePermission]
    required_permission = "articles.category_manage"
    module_code = "articles"
    lookup_field = "slug"
    lookup_url_kwarg = "slug"
    pagination_class = None

    def get_queryset(self):
        return Category.objects.all().order_by("name")

    def perform_create(self, serializer):
        obj = serializer.save(company=self.request.company)
        log_create(self.request.user, "Category", obj, request=self.request)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_update(self.request.user, "Category", obj, request=self.request)

    def perform_destroy(self, instance):
        log_delete(self.request.user, "Category", instance, request=self.request)
        instance.delete()

    def get_permissions(self):
        return [permissions.IsAuthenticated(), HasModuleAccess(), HasRolePermission()]


@extend_schema_view(
    list=extend_schema(tags=["Articles"]),
    retrieve=extend_schema(tags=["Articles"]),
    create=extend_schema(tags=["Articles"]),
    update=extend_schema(tags=["Articles"]),
    partial_update=extend_schema(tags=["Articles"]),
    destroy=extend_schema(tags=["Articles"]),
)
class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasRolePermission]
    required_permission = "articles.category_manage"
    module_code = "articles"
    lookup_field = "slug"
    pagination_class = None

    def get_queryset(self):
        return Tag.objects.all().order_by("name")

    def perform_create(self, serializer):
        obj = serializer.save(company=self.request.company)
        log_create(self.request.user, "Tag", obj, request=self.request)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_update(self.request.user, "Tag", obj, request=self.request)

    def perform_destroy(self, instance):
        log_delete(self.request.user, "Tag", instance, request=self.request)
        instance.delete()

    def get_permissions(self):
        return [permissions.IsAuthenticated(), HasModuleAccess(), HasRolePermission()]


@extend_schema_view(
    list=extend_schema(tags=["Articles"]),
    retrieve=extend_schema(tags=["Articles"]),
    create=extend_schema(tags=["Articles"]),
    update=extend_schema(tags=["Articles"]),
    partial_update=extend_schema(tags=["Articles"]),
    destroy=extend_schema(tags=["Articles"]),
    history=extend_schema(
        tags=["Articles"], responses={200: serializers.ListSerializer(child=serializers.DictField())}
    ),
    revert=extend_schema(tags=["Articles"], responses={200: serializers.DictField()}),
    submit_for_review=extend_schema(tags=["Articles"], responses={200: serializers.DictField()}),
    publish=extend_schema(tags=["Articles"], responses={200: serializers.DictField()}),
    reject=extend_schema(tags=["Articles"], responses={200: serializers.DictField()}),
)
class ArticleViewSet(viewsets.ModelViewSet):
    lookup_field = "slug"
    lookup_url_kwarg = "slug"
    serializer_class = ArticleSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "articles"
    filterset_class = ArticleFilter
    search_fields = ["title", "content", "excerpt"]
    ordering_fields = ["created_at", "updated_at", "title"]

    # Permissões granulares por action — gerenciadas por ActionRolePermission.
    # Isso evita mutar self.required_permission dentro de perform_create/update/destroy.
    action_permissions = {
        "list": "articles.article_view",
        "retrieve": "articles.article_view",
        "create": "articles.article_create",
        "update": "articles.article_edit",
        "partial_update": "articles.article_edit",
        "destroy": "articles.article_delete",
        "publish": "articles.article_publish",
        "submit_for_review": "articles.article_create",
        "reject": "articles.article_publish",
        "revert": "articles.article_edit",
        "history": "articles.article_view",
        "analytics": "articles.article_view",
        "analytics_detail": "articles.article_view",
        "moderation_metrics": "articles.article_view",
        "bulk_publish": "articles.article_publish",
        "bulk_reject": "articles.article_publish",
    }

    action_any_permissions = {
        "moderation_metrics": ["articles.article_view", "articles.comment_moderate", "articles.article_publish"],
    }

    def get_permissions(self):
        if getattr(self, "action", None) == "moderation_metrics":
            return [permissions.IsAuthenticated(), HasModuleAccess(), AnyRolePermission()]
        return super().get_permissions()

    def get_queryset(self):
        """
        Retorna artigos do tenant atual do usuário autenticado.
        Cross-tenant isolation: um usuário só pode ver artigos da sua própria empresa,
        independente de is_public. Artigos públicos de outros tenants são acessíveis
        apenas pelo PublicArticleViewSet (sem autenticação).
        """
        if self.request.user.is_authenticated:
            user_company = self.request.company
            return (
                Article.objects.filter(company=user_company)
                .select_related("category", "author", "company")
                .prefetch_related("tags")
                .annotate(
                    comment_count=Count("comments", filter=Q(comments__is_public=True, comments__is_approved=True))
                )
                .order_by("-created_at")
            )

        # Usuário anônimo: apenas públicos publicados
        return (
            Article.objects.filter(is_public=True, status=Article.STATUS_PUBLISHED, published_at__isnull=False)
            .select_related("category", "author", "company")
            .prefetch_related("tags")
            .annotate(comment_count=Count("comments", filter=Q(comments__is_public=True, comments__is_approved=True)))
            .order_by("-published_at")
        )

    def retrieve(self, request, *args, **kwargs):
        slug = kwargs.get("slug")
        company_slug = request.company.slug if request.company else "unassigned"
        cache_key = f"art_det:{company_slug}:{slug}"

        cached = cache.get(cache_key)
        if cached:
            ArticleService.record_view(
                request.user, article_id=cached.get("id"), ip_address=request.META.get("REMOTE_ADDR")
            )
            return Response(cached)

        instance = self.get_object()
        ArticleService.record_view(request.user, instance, request.META.get("REMOTE_ADDR"))
        data = self.get_serializer(instance).data
        cache.set(cache_key, data, timeout=60)  # Cache mais curto para editores
        return Response(data)

    def perform_create(self, serializer):
        # Permission already verified by ActionRolePermission before this point.
        from shared_kernel.licensing import check_feature_limit

        can_add, limit, current = check_feature_limit(self.request.company, "max_articles")
        if not can_add:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(f"Limite de artigos atingido ({current}/{limit}). Faça um upgrade do seu plano.")

        article = ArticleService.create_article(
            user=self.request.user,
            company=self.request.company,
            data=serializer.validated_data,
            image=self.request.FILES.get("image"),
        )
        
        # Se criado já como publicado (ex: marcado como público por admin), dispara efeitos
        if article.status == Article.STATUS_PUBLISHED:
            ArticleService.publish_article(self.request.user, article)
            
        serializer.instance = article
        log_create(self.request.user, "Article", article, request=self.request)

    def perform_update(self, serializer):
        # Permission already verified by ActionRolePermission before this point.
        old_status = serializer.instance.status
        new_status = serializer.validated_data.get("status")

        updated_article = ArticleService.update_article(
            user=self.request.user,
            article=serializer.instance,
            data=serializer.validated_data,
            image=self.request.FILES.get("image"),
        )
        
        # Se o status mudou para publicado agora, ou se foi salvo como público (o que força o status),
        # garantimos que as ações de publicação (webhooks, notificações) sejam disparadas.
        if new_status == Article.STATUS_PUBLISHED and old_status != Article.STATUS_PUBLISHED:
            # Re-chamamos o publish_article (que é idempotente para o status mas dispara os efeitos)
            ArticleService.publish_article(self.request.user, updated_article)
            
        serializer.instance = updated_article
        log_update(self.request.user, "Article", updated_article, request=self.request)

    def perform_destroy(self, instance):
        # O ArticleService.delete_article já realiza o log_delete, a invalidação de cache
        # e a exclusão física do objeto, além de disparar webhooks.
        ArticleService.delete_article(self.request.user, instance)

    @action(detail=True, methods=["get"])
    def history(self, request, slug=None):
        """
        Retorna o histórico de versões do artigo.
        """
        import reversion

        article = self.get_object()
        versions = reversion.models.Version.objects.get_for_object(article)

        data = []
        for version in versions:
            data.append(
                {
                    "id": version.id,
                    "created_at": version.revision.date_created,
                    "user": version.revision.user.username if version.revision.user else "System",
                    "comment": version.revision.comment,
                    # We could deserialize the data here if needed, but for now metadata is enough
                }
            )

        return Response(data)

    @action(detail=True, methods=["post"])
    def revert(self, request, slug=None):
        """
        Reverte o artigo para uma versão específica.
        """
        article = self.get_object()
        version_id = request.data.get("version_id")

        if not version_id:
            return Response({"error": "version_id is required"}, status=400)

        try:
            ArticleService.revert_to_version(request.user, article, version_id)
            return Response({"status": "restored"})
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"], url_path="submit")
    def submit_for_review(self, request, slug=None):
        article = self.get_object()
        try:
            ArticleService.submit_for_review(request.user, article)
            return Response({"status": "submitted"})
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"], url_path="publish")
    def publish(self, request, slug=None):
        article = self.get_object()
        try:
            ArticleService.publish_article(request.user, article)
            return Response({"status": "published"})
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=True, methods=["post"], url_path="reject")
    def reject(self, request, slug=None):
        article = self.get_object()
        reason = request.data.get("reason", "")
        try:
            ArticleService.reject_article(request.user, article, reason=reason)
            return Response({"status": "rejected"})
        except ValueError as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["post"], url_path="bulk/publish")
    def bulk_publish(self, request):
        slugs = request.data.get("slugs")
        if not isinstance(slugs, list) or not all(isinstance(s, str) and s.strip() for s in slugs):
            return Response({"detail": "Campo 'slugs' inválido."}, status=status.HTTP_400_BAD_REQUEST)
        slugs = [s.strip() for s in slugs]
        slugs = list(dict.fromkeys(slugs))
        if len(slugs) == 0:
            return Response({"detail": "Nenhum slug informado."}, status=status.HTTP_400_BAD_REQUEST)
        if len(slugs) > 100:
            return Response({"detail": "Máximo de 100 itens por requisição."}, status=status.HTTP_400_BAD_REQUEST)

        company = request.company
        qs = Article.objects.filter(company=company, slug__in=slugs).select_related("company")
        articles_by_slug = {a.slug: a for a in qs}

        approved: list[str] = []
        failed: list[dict] = []

        with transaction.atomic():
            for slug in slugs:
                article = articles_by_slug.get(slug)
                if not article:
                    failed.append({"slug": slug, "code": "not_found", "message": "Artigo não encontrado."})
                    continue
                try:
                    ArticleService.publish_article(request.user, article)
                    approved.append(slug)
                except ValueError as e:
                    failed.append({"slug": slug, "code": "invalid", "message": str(e)})

        return Response({"approved": approved, "failed": failed}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="bulk/reject")
    def bulk_reject(self, request):
        slugs = request.data.get("slugs")
        reason = request.data.get("reason", "") or ""
        if not isinstance(slugs, list) or not all(isinstance(s, str) and s.strip() for s in slugs):
            return Response({"detail": "Campo 'slugs' inválido."}, status=status.HTTP_400_BAD_REQUEST)
        slugs = [s.strip() for s in slugs]
        slugs = list(dict.fromkeys(slugs))
        if len(slugs) == 0:
            return Response({"detail": "Nenhum slug informado."}, status=status.HTTP_400_BAD_REQUEST)
        if len(slugs) > 100:
            return Response({"detail": "Máximo de 100 itens por requisição."}, status=status.HTTP_400_BAD_REQUEST)

        company = request.company
        qs = Article.objects.filter(company=company, slug__in=slugs).select_related("company")
        articles_by_slug = {a.slug: a for a in qs}

        rejected: list[str] = []
        failed: list[dict] = []

        with transaction.atomic():
            for slug in slugs:
                article = articles_by_slug.get(slug)
                if not article:
                    failed.append({"slug": slug, "code": "not_found", "message": "Artigo não encontrado."})
                    continue
                try:
                    ArticleService.reject_article(request.user, article, reason=reason)
                    rejected.append(slug)
                except ValueError as e:
                    failed.append({"slug": slug, "code": "invalid", "message": str(e)})

        return Response({"rejected": rejected, "failed": failed}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def moderation_metrics(self, request):
        from django.db.models.functions import TruncDate
        from django.utils import timezone

        company = request.company
        now = timezone.now()
        fifteen_days_ago = now.date() - timezone.timedelta(days=15)

        pending_articles = Article.objects.filter(company=company, status=Article.STATUS_PENDING).count()

        pending_qs = Comment.objects.filter(company=company, is_public=True, is_approved=False)
        pending_comments = pending_qs.filter(parent__isnull=True).count()
        pending_replies = pending_qs.filter(parent__isnull=False).count()

        pending_by_date = (
            pending_qs.filter(created_at__date__gte=fifteen_days_ago)
            .annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
        )

        top_articles = (
            pending_qs.values("article_id", "article__title", "article__slug")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        oldest = pending_qs.order_by("created_at").values("created_at", "article__title", "article__slug").first()

        return Response(
            {
                "pending_articles": pending_articles,
                "pending_comments": pending_comments,
                "pending_replies": pending_replies,
                "pending_total": pending_comments + pending_replies,
                "pending_total_all": pending_articles + pending_comments + pending_replies,
                "pending_by_date": list(pending_by_date),
                "top_articles": list(top_articles),
                "oldest_pending": oldest,
            }
        )

    @action(detail=False, methods=["get"])
    def analytics(self, request):
        """
        Retorna estatísticas globais de visualizações dos artigos do tenant.
        """
        from django.db.models import Count, Q
        from django.db.models.functions import TruncDate
        from django.utils import timezone

        company = request.company
        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)

        # 1. Estatísticas globais
        total_articles = Article.objects.filter(company=company).count()
        total_views = ArticleView.objects.filter(company=company).count()

        # 2. Artigos mais vistos (Top 5)
        most_viewed_qs = (
            Article.objects.filter(company=company)
            .annotate(
                total_views=Count("views"),
                views_last_30_days=Count("views", filter=Q(views__viewed_at__gte=thirty_days_ago)),
                unique_visitors=Count("views__ip_address", distinct=True),
            )
            .order_by("-total_views")[:5]
        )

        # 3. Visualizações por data (Últimos 15 dias)
        fifteen_days_ago = timezone.now().date() - timezone.timedelta(days=15)
        views_by_date_qs = (
            ArticleView.objects.filter(company=company, viewed_at__date__gte=fifteen_days_ago)
            .annotate(date=TruncDate("viewed_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
        )

        views_by_date = [{"date": item["date"].isoformat(), "count": item["count"]} for item in views_by_date_qs]

        data = {
            "total_articles": total_articles,
            "total_views": total_views,
            "most_viewed": most_viewed_qs,
            "views_by_date": views_by_date,
        }

        serializer = GlobalArticlesAnalyticsSerializer(data)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def analytics_detail(self, request, slug=None):
        """
        Retorna estatísticas detalhadas de um artigo específico.
        """
        from django.db.models import Count, Q
        from django.utils import timezone

        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)

        # Use get_object logic but with pre-annotation
        queryset = (
            self.get_queryset()
            .filter(slug=slug)
            .annotate(
                total_views=Count("views"),
                views_last_30_days=Count("views", filter=Q(views__viewed_at__gte=thirty_days_ago)),
                unique_visitors=Count("views__ip_address", distinct=True),
            )
        )
        article = queryset.first()

        if not article:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # Agregação básica (já calculada pelo serializer se passarmos o objeto)
        serializer = ArticleAnalyticsSerializer(article)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(tags=["Articles"]),
    retrieve=extend_schema(tags=["Articles"]),
    create=extend_schema(tags=["Articles"]),
    update=extend_schema(tags=["Articles"]),
    partial_update=extend_schema(tags=["Articles"]),
    destroy=extend_schema(tags=["Articles"]),
)
class CommentViewSet(viewsets.ModelViewSet):
    """
    Gerencia comentários dos artigos (painel interno).
    Requer permissão articles.comment_moderate.
    """

    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, HasRolePermission]
    required_permission = "articles.comment_moderate"
    module_code = "articles"
    filterset_fields = {
        "article": ["exact"],
        "is_approved": ["exact"],
        "is_public": ["exact"],
        "parent": ["exact", "isnull"],
        "created_at": ["gte", "lte"],
    }
    ordering_fields = ["created_at"]
    search_fields = ["content", "name", "email", "author__username", "article__title", "article__slug"]

    class BulkFilterSerializer(serializers.Serializer):
        article = serializers.IntegerField(required=False, min_value=1)
        is_approved = serializers.BooleanField(required=False)
        is_public = serializers.BooleanField(required=False)
        parent__isnull = serializers.BooleanField(required=False)
        created_at__gte = serializers.DateTimeField(required=False)
        created_at__lte = serializers.DateTimeField(required=False)
        search = serializers.CharField(required=False, allow_blank=True)
        include_replies = serializers.BooleanField(required=False)

    def get_serializer_class(self):
        if self.action in {"list", "retrieve"}:
            return ModerationCommentSerializer
        return CommentSerializer

    def _validate_bulk_filters(self, data):
        ser = self.BulkFilterSerializer(data=data)
        ser.is_valid(raise_exception=True)
        return ser.validated_data

    def _apply_bulk_filters(self, qs, f):
        if "article" in f:
            qs = qs.filter(article_id=f["article"])
        if "is_public" in f:
            qs = qs.filter(is_public=f["is_public"])
        if "is_approved" in f:
            qs = qs.filter(is_approved=f["is_approved"])
        if "parent__isnull" in f:
            qs = qs.filter(parent__isnull=f["parent__isnull"])
        if "created_at__gte" in f:
            qs = qs.filter(created_at__gte=f["created_at__gte"])
        if "created_at__lte" in f:
            qs = qs.filter(created_at__lte=f["created_at__lte"])
        if "search" in f and f["search"].strip():
            term = f["search"].strip()
            qs = qs.filter(
                Q(content__icontains=term)
                | Q(name__icontains=term)
                | Q(email__icontains=term)
                | Q(author__username__icontains=term)
                | Q(article__title__icontains=term)
                | Q(article__slug__icontains=term)
            )
        return qs

    def _include_replies(self, root_qs, f):
        root_ids = list(root_qs.values_list("id", flat=True))
        if not root_ids:
            return root_qs
        replies_qs = Comment.objects.filter(company=self.request.company, parent_id__in=root_ids)
        if "is_public" in f:
            replies_qs = replies_qs.filter(is_public=f["is_public"])
        reply_ids = list(replies_qs.values_list("id", flat=True))
        all_ids = root_ids + reply_ids
        return self.get_queryset().filter(id__in=all_ids)

    def get_queryset(self):
        return (
            Comment.objects.filter(company=self.request.company)
            .select_related("article", "author", "company")
            .prefetch_related(
                Prefetch(
                    "replies",
                    queryset=Comment.objects.filter(company=self.request.company)
                    .select_related("author")
                    .order_by("created_at"),
                    to_attr="prefetched_replies",
                )
            )
            .annotate(reply_count=Count("replies", filter=Q(replies__is_public=True)))
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        obj = serializer.save(company=self.request.company, author=self.request.user)
        log_create(self.request.user, "Comment", obj, request=self.request)

    def perform_destroy(self, instance):
        log_delete(self.request.user, "Comment", instance, request=self.request)
        instance.delete()

    def _notify_parent_author_reply_approved(self, request, reply: Comment):
        if not getattr(reply, "parent_id", None):
            return
        if not getattr(reply, "is_public", False):
            return
        if not getattr(reply, "article_id", None):
            return
        if not TenantModule.objects.filter(company=reply.company, module__code="articles", is_active=True).exists():
            return

        parent = (
            Comment.objects.filter(company=request.company, id=reply.parent_id)
            .select_related("author")
            .only("id", "author_id", "content")
            .first()
        )
        if not parent or not getattr(parent, "author_id", None):
            return

        if request.user and request.user.is_authenticated and request.user.id == parent.author_id:
            return
        pref = getattr(parent.author, "notification_preference", None)
        if pref and pref.notify_reply_approved_single is False:
            return

        from apps.notifications.models import Notification
        from apps.notifications.tasks import send_websocket_notification

        slug = getattr(reply.article, "slug", None)
        link = f"/p/artigos/{slug}#resposta-{reply.id}" if slug else "/artigos"
        snippet = (reply.content or "").strip()
        message = (
            f"{reply.article.title}: {snippet[:120]}"
            if snippet
            else f"Seu comentário em {reply.article.title} recebeu uma resposta."
        )

        notification = Notification.objects.create(
            company=reply.company,
            recipient=parent.author,
            notification_type=Notification.TYPE_MESSAGE,
            title="Nova resposta ao seu comentário",
            message=message,
            link=link,
        )
        try:
            send_websocket_notification.delay(
                f"notifications_user_{parent.author_id}",
                {
                    "type": "notification_message",
                    "notification_id": str(notification.id),
                    "notification_type": notification.notification_type,
                    "title": notification.title,
                    "message": notification.message,
                    "link": notification.link,
                    "created_at": notification.created_at.isoformat(),
                },
            )
        except Exception:
            pass

    def _notify_parent_author_thread_replies_approved(self, request, root: Comment, newly_approved_replies: int):
        if newly_approved_replies <= 0:
            return
        if not getattr(root, "author_id", None):
            return
        if request.user and request.user.is_authenticated and request.user.id == root.author_id:
            return
        pref = getattr(root.author, "notification_preference", None)
        if pref and pref.notify_reply_approved_thread is False:
            return
        if not TenantModule.objects.filter(company=root.company, module__code="articles", is_active=True).exists():
            return

        from apps.notifications.models import Notification
        from apps.notifications.tasks import send_websocket_notification

        slug = getattr(root.article, "slug", None)
        link = f"/p/artigos/{slug}#comentario-{root.id}" if slug else "/artigos"
        title = "Novas respostas ao seu comentário"
        aggregate_key = f"articles.thread.reply_approved:{root.id}"
        notification = (
            Notification.objects.filter(
                company=root.company,
                recipient=root.author,
                is_read=False,
                notification_type=Notification.TYPE_MESSAGE,
                title=title,
                aggregate_key=aggregate_key,
            )
            .order_by("-created_at")
            .first()
        )

        total = int(newly_approved_replies)
        if notification:
            total = int(getattr(notification, "aggregate_count", 1) or 1) + int(newly_approved_replies)

        last_reply = (
            Comment.objects.filter(company=request.company, parent_id=root.id, is_public=True)
            .order_by("-created_at")
            .values("id", "content")
            .first()
        )
        last_snippet = ((last_reply.get("content") or "").strip()[:120]) if last_reply else ""
        if last_snippet:
            message = f"{total} resposta(s) foram aprovadas em {root.article.title}. Último: {last_snippet}"
        else:
            message = f"{total} resposta(s) foram aprovadas em {root.article.title}."

        if notification:
            notification.message = message
            notification.link = link
            notification.is_read = False
            notification.aggregate_count = total
            notification.metadata = {
                "kind": "thread_reply_approved",
                "root_comment_id": root.id,
                "article_id": root.article_id,
                "last_reply_id": last_reply.get("id") if last_reply else None,
                "last_snippet": last_snippet or None,
            }
            notification.save(update_fields=["message", "link", "is_read", "aggregate_count", "metadata"])
        else:
            notification = Notification.objects.create(
                company=root.company,
                recipient=root.author,
                notification_type=Notification.TYPE_MESSAGE,
                title=title,
                message=message,
                link=link,
                aggregate_key=aggregate_key,
                aggregate_count=total,
                metadata={
                    "kind": "thread_reply_approved",
                    "root_comment_id": root.id,
                    "article_id": root.article_id,
                    "last_reply_id": last_reply.get("id") if last_reply else None,
                    "last_snippet": last_snippet or None,
                },
            )
        try:
            send_websocket_notification.delay(
                f"notifications_user_{root.author_id}",
                {
                    "type": "notification_message",
                    "notification_id": str(notification.id),
                    "notification_type": notification.notification_type,
                    "title": notification.title,
                    "message": notification.message,
                    "link": notification.link,
                    "created_at": notification.created_at.isoformat(),
                },
            )
        except Exception:
            pass

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """
        Aprova um comentário pendente de moderação.
        """
        comment = self.get_object()
        was_approved = bool(comment.is_approved)
        comment.is_approved = True
        comment.save(update_fields=["is_approved"])
        log_update(request.user, "Comment", comment, request=request)
        if not was_approved:
            self._notify_parent_author_reply_approved(request, comment)
        return Response({"status": "approved"})

    @action(detail=True, methods=["post"])
    def disapprove(self, request, pk=None):
        comment = self.get_object()
        comment.is_approved = False
        comment.save(update_fields=["is_approved"])
        log_update(request.user, "Comment", comment, request=request)
        return Response({"status": "disapproved"})

    @action(detail=False, methods=["get"])
    def moderation_metrics(self, request):
        from django.db.models.functions import TruncDate
        from django.utils import timezone

        company = request.company
        now = timezone.now()
        fifteen_days_ago = now.date() - timezone.timedelta(days=15)

        pending_qs = Comment.objects.filter(company=company, is_public=True, is_approved=False)
        pending_comments = pending_qs.filter(parent__isnull=True).count()
        pending_replies = pending_qs.filter(parent__isnull=False).count()
        pending_articles = Article.objects.filter(company=company, status=Article.STATUS_PENDING).count()

        pending_by_date = (
            pending_qs.filter(created_at__date__gte=fifteen_days_ago)
            .annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
        )

        top_articles = (
            pending_qs.values("article_id", "article__title", "article__slug")
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        oldest = pending_qs.order_by("created_at").values("created_at", "article__title", "article__slug").first()

        return Response(
            {
                "pending_articles": pending_articles,
                "pending_comments": pending_comments,
                "pending_replies": pending_replies,
                "pending_total": pending_comments + pending_replies,
                "pending_total_all": pending_articles + pending_comments + pending_replies,
                "pending_by_date": list(pending_by_date),
                "top_articles": list(top_articles),
                "oldest_pending": oldest,
            }
        )

    @action(detail=True, methods=["post"])
    def approve_thread(self, request, pk=None):
        root = self.get_object()
        if getattr(root, "parent_id", None):
            root = root.parent
        newly_approved_replies = Comment.objects.filter(
            company=request.company, parent_id=root.id, is_approved=False
        ).count()
        qs = self.get_queryset().filter(Q(id=root.id) | Q(parent_id=root.id))
        ids = list(qs.values_list("id", flat=True))
        updated = qs.update(is_approved=True)
        if ids:
            for c in Comment.objects.filter(id__in=ids):
                log_update(request.user, "Comment", c, request=request)
        self._notify_parent_author_thread_replies_approved(request, root, newly_approved_replies)
        return Response({"updated": updated})

    @action(detail=True, methods=["post"])
    def disapprove_thread(self, request, pk=None):
        root = self.get_object()
        if getattr(root, "parent_id", None):
            root = root.parent
        qs = self.get_queryset().filter(Q(id=root.id) | Q(parent_id=root.id))
        ids = list(qs.values_list("id", flat=True))
        updated = qs.update(is_approved=False)
        if ids:
            for c in Comment.objects.filter(id__in=ids):
                log_update(request.user, "Comment", c, request=request)
        return Response({"updated": updated})

    @action(detail=True, methods=["post"])
    def delete_thread(self, request, pk=None):
        root = self.get_object()
        if getattr(root, "parent_id", None):
            root = root.parent
        qs = self.get_queryset().filter(Q(id=root.id) | Q(parent_id=root.id))
        to_delete = list(qs)
        for c in to_delete:
            log_delete(request.user, "Comment", c, request=request)
        deleted, _ = qs.delete()
        return Response({"deleted": deleted})

    @action(detail=True, methods=["get"])
    def replies(self, request, pk=None):
        from config.pagination import DefaultPagination

        root = self.get_object()
        if getattr(root, "parent_id", None):
            root = root.parent
        qs = (
            self.get_queryset()
            .filter(parent_id=root.id, is_public=True)
            .select_related("article", "author", "company")
            .order_by("created_at", "id")
        )
        pagination = DefaultPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        ser = ModerationReplySerializer(page, many=True, context={"request": request})
        return pagination.get_paginated_response(ser.data)

    class BulkIdsSerializer(serializers.Serializer):
        ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False)

    @action(detail=False, methods=["post"])
    def bulk_approve(self, request):
        ser = self.BulkIdsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["ids"]
        qs = self.get_queryset().filter(id__in=ids)
        updated = qs.update(is_approved=True)
        for c in Comment.objects.filter(id__in=ids):
            log_update(request.user, "Comment", c, request=request)
        return Response({"updated": updated})

    @action(detail=False, methods=["post"])
    def bulk_disapprove(self, request):
        ser = self.BulkIdsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["ids"]
        qs = self.get_queryset().filter(id__in=ids)
        updated = qs.update(is_approved=False)
        for c in Comment.objects.filter(id__in=ids):
            log_update(request.user, "Comment", c, request=request)
        return Response({"updated": updated})

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        ser = self.BulkIdsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ids = ser.validated_data["ids"]
        qs = self.get_queryset().filter(id__in=ids)
        to_delete = list(qs)
        for c in to_delete:
            log_delete(request.user, "Comment", c, request=request)
        deleted, _ = qs.delete()
        return Response({"deleted": deleted})

    @action(detail=False, methods=["post"])
    def bulk_approve_filtered(self, request):
        f = self._validate_bulk_filters(request.data)
        include_replies = bool(f.get("include_replies")) and f.get("parent__isnull") is True
        qs = self._apply_bulk_filters(self.get_queryset(), f)
        if include_replies:
            qs = self._include_replies(qs, f)
        ids = list(qs.values_list("id", flat=True))
        updated = qs.update(is_approved=True)
        if ids:
            for c in Comment.objects.filter(id__in=ids):
                log_update(request.user, "Comment", c, request=request)
        return Response({"updated": updated})

    @action(detail=False, methods=["post"])
    def bulk_disapprove_filtered(self, request):
        f = self._validate_bulk_filters(request.data)
        include_replies = bool(f.get("include_replies")) and f.get("parent__isnull") is True
        qs = self._apply_bulk_filters(self.get_queryset(), f)
        if include_replies:
            qs = self._include_replies(qs, f)
        ids = list(qs.values_list("id", flat=True))
        updated = qs.update(is_approved=False)
        if ids:
            for c in Comment.objects.filter(id__in=ids):
                log_update(request.user, "Comment", c, request=request)
        return Response({"updated": updated})

    @action(detail=False, methods=["post"])
    def bulk_delete_filtered(self, request):
        f = self._validate_bulk_filters(request.data)
        include_replies = bool(f.get("include_replies")) and f.get("parent__isnull") is True
        qs = self._apply_bulk_filters(self.get_queryset(), f)
        if include_replies:
            qs = self._include_replies(qs, f)
        to_delete = list(qs)
        for c in to_delete:
            log_delete(request.user, "Comment", c, request=request)
        deleted, _ = qs.delete()
        return Response({"deleted": deleted})

    @action(detail=False, methods=["post"])
    def bulk_filtered_count(self, request):
        f = self._validate_bulk_filters(request.data)
        include_replies = bool(f.get("include_replies")) and f.get("parent__isnull") is True
        qs = self._apply_bulk_filters(self.get_queryset(), f)
        if include_replies:
            qs = self._include_replies(qs, f)
        count = qs.count()
        sample_ids = list(qs.order_by("-created_at").values_list("id", flat=True)[:20])
        sample_qs = self.get_queryset().filter(id__in=sample_ids).order_by("-created_at")
        sample_items = ModerationReplySerializer(sample_qs, many=True, context={"request": request}).data
        return Response({"count": count, "sample_ids": sample_ids, "sample_items": sample_items})


@extend_schema_view(
    list=extend_schema(tags=["Public Articles"], description="Lista comentários aprovados de um artigo público"),
    create=extend_schema(tags=["Public Articles"], description="Cria comentário público pendente de moderação"),
)
class PublicCommentViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    Endpoint público de comentários com moderação e rate limit básico.
    """

    from rest_framework.throttling import ScopedRateThrottle
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'public_comments'

    serializer_class = PublicCommentSerializer
    permission_classes = [permissions.AllowAny]
    filterset_fields = ["article"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]

    def get_serializer_class(self):
        if self.action == "create":
            return CommentSerializer
        return PublicCommentSerializer

    def _notify_moderators(self, comment: Comment, article: Article):
        if not TenantModule.objects.filter(company=article.company, module__code="articles", is_active=True).exists():
            return

        from apps.notifications.models import Notification
        from apps.notifications.tasks import send_websocket_notification

        User = get_user_model()
        is_reply = bool(getattr(comment, "parent_id", None))
        perm = "articles.comment_moderate"
        candidates = (
            User.all_objects.filter(company=article.company, is_active=True)
            .select_related("role", "notification_preference")
            .filter(Q(is_superuser=True) | Q(is_staff=True) | Q(role__isnull=False))
        )
        recipients = []
        for u in candidates:
            pref = getattr(u, "notification_preference", None)
            if pref:
                if is_reply and pref.notify_moderation_reply_pending is False:
                    continue
                if not is_reply and pref.notify_moderation_comment_pending is False:
                    continue
            if u.is_superuser or u.is_staff:
                recipients.append(u)
                continue
            role = getattr(u, "role", None)
            perms = getattr(role, "permissions", None) if role else None
            if isinstance(perms, list) and perm in perms:
                recipients.append(u)
        if getattr(comment, "author_id", None):
            recipients = [u for u in recipients if u.id != comment.author_id]

        root_id = comment.parent_id or comment.id
        if is_reply:
            link = f"/artigos/comentarios?status=approved&article={article.id}&comment={root_id}#comentario-{root_id}"
            title = "Nova resposta pendente"
        else:
            link = f"/artigos/comentarios?status=pending&article={article.id}&comment={root_id}#comentario-{root_id}"
            title = "Novo comentário pendente"
        msg_content = (comment.content or "").strip()
        if is_reply:
            parent_content = None
            try:
                parent_id = comment.parent_id
                if parent_id:
                    parent_content = (
                        Comment.objects.filter(company=article.company, id=parent_id)
                        .values_list("content", flat=True)
                        .first()
                    )
            except Exception:
                parent_content = None

            parent_snippet = ((parent_content or "").strip()[:80]) if parent_content else ""
            if msg_content and parent_snippet:
                message = f"{article.title}: {parent_snippet} → {msg_content[:120]}"
            elif msg_content:
                message = f"{article.title}: {msg_content[:120]}"
            else:
                message = f"Nova resposta pendente em {article.title}."
        else:
            message = (
                f"{article.title}: {msg_content[:120]}"
                if msg_content
                else f"Novo comentário pendente em {article.title}."
            )

        for u in recipients:
            aggregate_key = f"articles.moderation.pending:{article.id}:{'r' if is_reply else 'c'}"
            notification = (
                Notification.objects.filter(
                    company=article.company,
                    recipient=u,
                    is_read=False,
                    notification_type=Notification.TYPE_APPROVAL,
                    title=title,
                    aggregate_key=aggregate_key,
                )
                .order_by("-created_at")
                .first()
            )

            count = 1
            if notification:
                count = int(getattr(notification, "aggregate_count", 1) or 1) + 1

            last = message
            prefix = f"{article.title}: "
            if last.startswith(prefix):
                last = last[len(prefix) :]

            if count <= 1:
                final_message = message
            else:
                if is_reply:
                    final_message = f"{count} respostas pendentes em {article.title}. Último: {last}"
                else:
                    final_message = f"{count} comentários pendentes em {article.title}. Último: {last}"

            if notification:
                notification.message = final_message
                notification.link = link
                notification.is_read = False
                notification.aggregate_count = count
                notification.metadata = {
                    "kind": "comment_moderation_pending",
                    "article_id": article.id,
                    "root_comment_id": root_id,
                    "last_comment_id": comment.id,
                    "is_reply": bool(is_reply),
                    "last_snippet": last,
                }
                notification.save(update_fields=["message", "link", "is_read", "aggregate_count", "metadata"])
            else:
                notification = Notification.objects.create(
                    company=article.company,
                    recipient=u,
                    notification_type=Notification.TYPE_APPROVAL,
                    title=title,
                    message=final_message,
                    link=link,
                    aggregate_key=aggregate_key,
                    aggregate_count=count,
                    metadata={
                        "kind": "comment_moderation_pending",
                        "article_id": article.id,
                        "root_comment_id": root_id,
                        "last_comment_id": comment.id,
                        "is_reply": bool(is_reply),
                        "last_snippet": last,
                    },
                )
            try:
                send_websocket_notification.delay(
                    f"notifications_user_{u.id}",
                    {
                        "type": "notification_message",
                        "notification_id": str(notification.id),
                        "notification_type": notification.notification_type,
                        "title": notification.title,
                        "message": notification.message,
                        "link": notification.link,
                        "created_at": notification.created_at.isoformat(),
                    },
                )
            except Exception:
                pass

    def get_queryset(self):
        from .models import Article

        company = getattr(self.request, "company", None)
        if not company:
            return Comment.objects.none()

        qs = (
            Comment.objects.filter(is_approved=True, is_public=True, parent__isnull=True)
            .select_related("article", "author", "company")
            .annotate(reply_count=Count("replies", filter=Q(replies__is_approved=True, replies__is_public=True)))
            .prefetch_related(
                Prefetch(
                    "replies",
                    queryset=Comment.objects.filter(is_approved=True, is_public=True)
                    .select_related("author")
                    .order_by("created_at"),
                    to_attr="prefetched_replies",
                )
            )
            .order_by("-created_at")
        )
        article_slug = self.request.query_params.get("article_slug")
        article_id = self.request.query_params.get("article")
        if article_slug:
            article_qs = Article.objects.filter(slug=article_slug, is_public=True, status=Article.STATUS_PUBLISHED)
            article_qs = article_qs.filter(company=company)
            article = article_qs.first()
            if article:
                qs = qs.filter(article=article, company=article.company)
            else:
                qs = qs.none()
        elif article_id:
            qs = qs.filter(article_id=article_id)
            qs = qs.filter(company=company)
        else:
            qs = qs.none()
        return qs

    @action(detail=True, methods=["get"])
    def replies(self, request, pk=None):
        from config.pagination import DefaultPagination

        company = getattr(request, "company", None)
        if not company:
            return Response({"detail": "Contexto de empresa ausente."}, status=status.HTTP_400_BAD_REQUEST)

        root = Comment.objects.filter(
            company=company, id=pk, is_public=True, is_approved=True, parent__isnull=True
        ).first()
        if not root:
            return Response({"detail": "Comentário não encontrado."}, status=status.HTTP_404_NOT_FOUND)

        qs = (
            Comment.objects.filter(company=company, parent_id=root.id, is_public=True, is_approved=True)
            .select_related("author")
            .order_by("created_at", "id")
        )
        pagination = DefaultPagination()
        page = pagination.paginate_queryset(qs, request, view=self)
        ser = PublicReplySerializer(page, many=True, context={"request": request})
        return pagination.get_paginated_response(ser.data)

    def create(self, request, *args, **kwargs):
        """
        Cria comentário público com moderação (is_approved=False) e rate limit por IP.
        Requer article_slug ou article (id) no corpo.
        """
        from .models import Article

        data = request.data.copy()
        if data.get("website") or data.get("hp"):
            return Response(status=status.HTTP_204_NO_CONTENT)
        article_slug = data.get("article_slug")
        article_id = data.get("article")
        company = getattr(request, "company", None)
        if not company:
            return Response({"detail": "Contexto de empresa ausente."}, status=status.HTTP_400_BAD_REQUEST)

        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        ip = (
            forwarded_for.split(",")[0].strip()
            if forwarded_for and isinstance(forwarded_for, str)
            else request.META.get("REMOTE_ADDR", "unknown")
        )
        company_key = company.slug

        # Resolver artigo
        article = None
        if article_slug:
            article = Article.objects.filter(
                slug=article_slug, is_public=True, status=Article.STATUS_PUBLISHED, company=company
            ).first()
        elif article_id:
            article = Article.objects.filter(
                pk=article_id, is_public=True, status=Article.STATUS_PUBLISHED, company=company
            ).first()

        if not article:
            return Response({"detail": "Artigo não encontrado ou não público."}, status=status.HTTP_404_NOT_FOUND)

        key = f"rate:pub_comment:{company_key}:{article.id}:{ip}"
        count = cache.get(key, 0)
        if count >= 5:
            return Response(
                {"detail": "Limite de envio de comentários atingido. Tente mais tarde."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(key, count + 1, timeout=600)

        parent_id = data.get("parent")
        parent = None
        if parent_id:
            try:
                parent_obj = (
                    Comment.objects.filter(
                        pk=parent_id, article=article, company=article.company, is_public=True, is_approved=True
                    )
                    .select_related("parent")
                    .first()
                )
            except Exception:
                parent_obj = None
            if not parent_obj:
                return Response({"detail": "Comentário pai inválido."}, status=status.HTTP_400_BAD_REQUEST)
            parent = parent_obj.parent if parent_obj.parent_id else parent_obj

        author = None
        if request.user.is_authenticated and getattr(request.user, "company_id", None) == article.company_id:
            author = request.user

        name_value = data.get("name", "") or ""
        email_value = data.get("email", "") or ""
        if author:
            if not name_value:
                name_value = author.get_full_name() or author.username
            if not email_value:
                email_value = getattr(author, "email", "") or ""

        content_value = (data.get("content", "") or "").strip()
        if not content_value:
            return Response({"detail": "Conteúdo obrigatório."}, status=status.HTTP_400_BAD_REQUEST)
        if len(content_value) < 3:
            return Response({"detail": "Conteúdo muito curto."}, status=status.HTTP_400_BAD_REQUEST)
        lowered = content_value.lower()
        link_hits = lowered.count("http://") + lowered.count("https://") + lowered.count("www.")
        if link_hits >= 3:
            return Response({"detail": "Conteúdo suspeito."}, status=status.HTTP_400_BAD_REQUEST)

        normalized_email = (email_value or "").strip().lower()
        if normalized_email:
            cooldown_seconds = 20 if parent else 30
            cooldown_key = f"cooldown:pub_comment:{company_key}:{normalized_email}:{parent.id if parent else 0}"
            if cache.get(cooldown_key):
                return Response(
                    {"detail": "Aguarde um pouco antes de enviar outro comentário."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            cache.set(cooldown_key, 1, timeout=cooldown_seconds)

            email_key = f"rate:pub_comment:email:{company_key}:{article.id}:{normalized_email}"
            email_count = cache.get(email_key, 0)
            if email_count >= 3:
                return Response(
                    {"detail": "Limite de envio por email atingido. Tente mais tarde."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            cache.set(email_key, email_count + 1, timeout=3600)

        try:
            import hashlib

            ua = (request.META.get("HTTP_USER_AGENT") or "")[:200]
            fp_source = f"{ip}|{ua}|{normalized_email or '-'}"
            fp = hashlib.sha256(fp_source.encode("utf-8")).hexdigest()[:16]
            fp_key = f"rate:pub_comment:fp:{company_key}:{article.id}:{fp}"
            fp_count = cache.get(fp_key, 0)
            if fp_count >= 5:
                return Response(
                    {"detail": "Limite de envio atingido. Tente mais tarde."},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            cache.set(fp_key, fp_count + 1, timeout=3600)
        except Exception:
            pass

        # Criar comentário pendente de moderação
        serializer = self.get_serializer(
            data={
                "article": article.id,
                "parent": parent.id if parent else None,
                "name": name_value,
                "email": email_value,
                "content": content_value,
            }
        )
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(company=article.company, author=author, is_approved=False, is_public=True, parent=parent)
        self._notify_moderators(obj, article)
        headers = self.get_success_headers(serializer.data)
        return Response(
            PublicCommentSerializer(obj, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
            headers=headers,
        )
