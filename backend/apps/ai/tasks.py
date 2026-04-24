import logging
from celery import shared_task
from django.apps import apps
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3)
def analyze_deal_ai_metadata(self, deal_id):
    """
    Atlas AI (AIOps): Realiza a triagem inteligente e análise de contexto de um Card.
    Esta tarefa foi movida para o app dedicado 'ai' para permitir expansão futura.
    """
    Deal = apps.get_model("crm", "Deal")
    TenantModule = apps.get_model("module_manager", "TenantModule")
    
    try:
        deal = Deal.all_objects.select_related("company").get(id=deal_id)
        
        # Governança: Verifica se o módulo de IA está ativo para este tenant
        is_ai_active = TenantModule.all_objects.filter(
            company=deal.company, 
            module__code="ai", 
            is_active=True
        ).exists()
        
        if not is_ai_active:
            logger.info(f"AI Module inactive for company {deal.company.slug}. Skipping analysis.")
            return "ai_module_inactive"

        if not deal.description or len(deal.description) < 10:
            return "description_too_short"

        # Lógica de Inteligência (Mock expandido pronto para Gemini/OpenAI)
        desc_lower = deal.description.lower()
        title_lower = deal.title.lower()
        
        # Heurística de AIOps para ITIL v5
        suggested_priority = "MEDIUM"
        if any(word in desc_lower or word in title_lower for word in ["urgente", "parado", "crítico", "não funciona"]):
            suggested_priority = "HIGH"
        
        record_type = "incident"
        if any(word in desc_lower for word in ["solicito", "preciso de", "instalar", "liberação"]):
            record_type = "service_request"
            
        ai_suggestion = {
            "suggested_record_type": record_type,
            "suggested_priority": suggested_priority,
            "confidence_score": 0.92,
            "itil_v5_category": "AI Managed" if suggested_priority == "HIGH" else "Standard Operation",
            "summary": f"IA detectou um {record_type} com prioridade {suggested_priority} baseada no contexto operacional.",
            "processed_at": timezone.now().isoformat()
        }
        
        deal.ai_metadata = ai_suggestion
        deal.save(update_fields=["ai_metadata"])
        
        return f"AI Analysis (app.ai) complete for deal {deal_id}"
        
    except Exception as e:
        logger.error(f"Error in AI Triage (app.ai) for deal {deal_id}: {str(e)}")
        raise self.retry(exc=e, countdown=60)

@shared_task
def get_kb_suggestions_ai(deal_id):
    """
    Lógica de RAG para sugerir artigos da base de conhecimento.
    """
    Deal = apps.get_model("crm", "Deal")
    Article = apps.get_model("articles", "Article")
    
    try:
        deal = Deal.all_objects.get(id=deal_id)
        
        articles = Article.objects.filter(
            company=deal.company,
            status="published"
        ).filter(
            Q(title__icontains=deal.title[:20]) | 
            Q(content__icontains=deal.title[:20])
        )[:3]
        
        return [
            {
                "id": a.id,
                "title": a.title,
                "slug": a.slug,
                "excerpt": a.excerpt or a.content[:150]
            } for a in articles
        ]
    except Exception as e:
        logger.error(f"Error in KB AI Suggestions: {e}")
        return []
