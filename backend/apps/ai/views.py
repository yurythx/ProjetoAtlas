from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.module_manager.permissions import HasModuleAccess
from .tasks import get_kb_suggestions_ai

class AIKBSuggestionsAPIView(APIView):
    """
    Endpoint para obter sugestões de IA baseadas em um card do CRM.
    Governança: Requer o módulo 'ai' ativo.
    """
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess]
    module_code = "ai"

    def get(self, request, deal_id):
        # Executa a busca de artigos via lógica de IA (RAG)
        suggestions = get_kb_suggestions_ai(deal_id)
        
        ai_summary = (
            f"A IA Atlas analisou o contexto deste card e localizou {len(suggestions)} artigos "
            "que podem acelerar sua resolução."
        ) if suggestions else "Nenhum artigo diretamente relacionado foi encontrado pela IA no momento."

        return Response({
            "suggestions": suggestions,
            "ai_summary": ai_summary
        })
