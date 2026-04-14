from django.contrib.auth import get_user_model
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, response, viewsets

from apps.articles.models import Article
from apps.articles.serializers import ArticleSerializer
from apps.messenger.models import Message
from apps.messenger.serializers import MessageSerializer
from apps.pages.models import Page
from apps.pages.serializers import PageSerializer

from .serializers import GlobalSearchSerializer

User = get_user_model()


class GlobalSearchViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: GlobalSearchSerializer})
    def list(self, request):
        query = request.query_params.get("q", "")
        if not query or len(query) < 2:
            return response.Response({"articles": [], "pages": [], "messages": [], "contacts": []})

        company = request.user.company

        # 1. Articles
        articles = Article.objects.filter(company=company).filter(
            Q(title__icontains=query) | Q(content__icontains=query)
        )[:10]

        # 2. Pages
        pages = Page.objects.filter(company=company).filter(Q(title__icontains=query) | Q(slug__icontains=query))[:10]

        # 3. Messenger (Messages the user has access to)
        messages = (
            Message.objects.filter(company=company, conversation__participants=request.user)
            .filter(content__icontains=query, is_deleted=False)
            .select_related("sender", "conversation")[:10]
        )

        # 4. Contacts (Users in the same company)
        contacts = (
            User.objects.filter(company=company)
            .filter(
                Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(username__icontains=query)
                | Q(email__icontains=query)
            )
            .exclude(id=request.user.id)[:10]
        )

        return response.Response(
            {
                "articles": ArticleSerializer(articles, many=True).data,
                "pages": PageSerializer(pages, many=True).data,
                "messages": MessageSerializer(messages, many=True, context={"request": request}).data,
                "contacts": [
                    {
                        "id": u.id,
                        "username": u.username,
                        "full_name": f"{u.first_name} {u.last_name}".strip(),
                        "avatar": u.avatar.url if u.avatar else None,
                        "status": u.status,
                    }
                    for u in contacts
                ],
            }
        )
