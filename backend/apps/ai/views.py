import re

from django.apps import apps
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.module_manager.permissions import HasModuleAccess

from .tasks import get_kb_suggestions_ai, summarize_article_ai, suggest_deal_priority_ai


class AIKBSuggestionsAPIView(APIView):
    """Suggest KB articles related to a CRM deal. Requires 'ai' module."""
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess]
    module_code = "ai"

    def get(self, request, deal_id):
        suggestions = get_kb_suggestions_ai(deal_id)
        ai_summary = (
            f"A IA Atlas analisou o contexto deste card e localizou {len(suggestions)} artigos "
            "que podem acelerar sua resolução."
        ) if suggestions else "Nenhum artigo diretamente relacionado foi encontrado pela IA no momento."
        return Response({"suggestions": suggestions, "ai_summary": ai_summary})


class AIArticleSummarizeAPIView(APIView):
    """Generate or return a cached AI summary for an article. Requires 'ai' module."""
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess]
    module_code = "ai"

    def post(self, request, article_id):
        Article = apps.get_model("articles", "Article")
        try:
            article = Article.objects.get(id=article_id, company=request.company)
        except Article.DoesNotExist:
            return Response({"detail": "Article not found."}, status=status.HTTP_404_NOT_FOUND)

        summary = summarize_article_ai(article_id)
        return Response({"article_id": article_id, "summary": summary})


class AIDealPrioritySuggestAPIView(APIView):
    """Return AI-derived priority and record_type suggestion for a deal. Requires 'ai' module."""
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess]
    module_code = "ai"

    def get(self, request, deal_id):
        Deal = apps.get_model("crm", "Deal")
        try:
            deal = Deal.objects.get(id=deal_id, company=request.company)
        except Deal.DoesNotExist:
            return Response({"detail": "Deal not found."}, status=status.HTTP_404_NOT_FOUND)

        suggestion = suggest_deal_priority_ai(deal_id)
        return Response(suggestion)
