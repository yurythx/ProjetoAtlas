import json
import logging
import re

from celery import shared_task
from django.apps import apps
from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Gemini helper
# ---------------------------------------------------------------------------

def _call_gemini(prompt: str, timeout: int = 20) -> str | None:
    """
    Send a prompt to Google Gemini 1.5 Flash.
    Returns the response text, or None if the key is missing or the call fails.
    Callers must implement their own fallback for the None case.
    """
    api_key = getattr(settings, "GEMINI_API_KEY", "") or ""
    if not api_key:
        return None
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(max_output_tokens=512, temperature=0.2),
            request_options={"timeout": timeout},
        )
        return (response.text or "").strip()
    except Exception as exc:
        logger.warning("Gemini API call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Internal heuristics (fallback when Gemini is not configured)
# ---------------------------------------------------------------------------

def _heuristic_priority(deal) -> dict:
    desc = (deal.description or "").lower()
    title = deal.title.lower()

    priority = "MEDIUM"
    if any(w in desc or w in title for w in ["urgente", "parado", "crítico", "down", "falha crítica", "não funciona"]):
        priority = "HIGH"
    elif any(w in desc or w in title for w in ["melhoria", "sugestão", "quando possível"]):
        priority = "LOW"

    record_type = "incident"
    if any(w in desc for w in ["solicito", "preciso de", "instalar", "liberação", "acesso", "criar usuário"]):
        record_type = "service_request"
    elif any(w in desc for w in ["melhoria", "otimizar", "enhancement"]):
        record_type = "change"

    return {
        "suggested_priority": priority,
        "suggested_record_type": record_type,
        "confidence_score": 0.70,
        "itil_v5_category": "AI Managed" if priority == "HIGH" else "Standard Operation",
        "reasoning": f"Palavras-chave detectadas no título/descrição indicam {record_type} com prioridade {priority}.",
        "source": "heuristic",
    }


# ---------------------------------------------------------------------------
# Public AI functions (used by views)
# ---------------------------------------------------------------------------

def summarize_article_ai(article_id: int) -> str:
    """
    Return a summary for an article.
    - Checks Redis cache first (1-hour TTL).
    - Calls Gemini if API key is configured.
    - Falls back to extractive summary (first 3 sentences) when Gemini is unavailable.
    """
    cache_key = f"ai:article_summary:{article_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    Article = apps.get_model("articles", "Article")
    try:
        article = Article.objects.get(id=article_id)
    except Article.DoesNotExist:
        return ""

    plain = re.sub(r"<[^>]+>", " ", article.content or "")
    plain = re.sub(r"\s+", " ", plain).strip()
    truncated = plain[:4000]

    gemini_summary = _call_gemini(
        f"Summarize the following article in 2-3 sentences. "
        f"Write in the same language as the article. Be concise and factual.\n\n{truncated}"
    )

    if gemini_summary:
        summary = gemini_summary
    else:
        sentences = re.split(r"(?<=[.!?])\s+", plain)
        summary = " ".join(sentences[:3]).strip() or article.excerpt or plain[:300]

    cache.set(cache_key, summary, timeout=3600)
    return summary


def suggest_deal_priority_ai(deal_id: int) -> dict:
    """
    Return a priority/record_type suggestion for a deal.
    - Calls Gemini with a structured JSON prompt when configured.
    - Falls back to keyword heuristic on error or missing key.
    """
    Deal = apps.get_model("crm", "Deal")
    try:
        deal = Deal.objects.get(id=deal_id)
    except Deal.DoesNotExist:
        return {}

    prompt = (
        "You are an ITIL v5 service desk classifier. "
        "Analyze the ticket below and respond ONLY with a JSON object — no markdown, no explanation.\n\n"
        f"Title: {deal.title}\n"
        f"Description: {deal.description or 'No description provided.'}\n\n"
        'Respond with exactly this shape:\n'
        '{"suggested_priority": "LOW|MEDIUM|HIGH|CRITICAL", '
        '"suggested_record_type": "incident|problem|change|service_request", '
        '"reasoning": "<one sentence in the ticket language>"}'
    )

    raw = _call_gemini(prompt)
    if raw:
        try:
            # Strip accidental markdown fences Gemini sometimes adds
            clean = re.sub(r"```(?:json)?|```", "", raw).strip()
            result = json.loads(clean)
            result.setdefault("confidence_score", 0.95)
            result.setdefault("itil_v5_category", "AI Managed" if result.get("suggested_priority") in ("HIGH", "CRITICAL") else "Standard Operation")
            result["source"] = "gemini"
            return result
        except (json.JSONDecodeError, KeyError) as exc:
            logger.warning("Gemini returned malformed JSON for deal %s: %s — raw: %s", deal_id, exc, raw[:200])

    return _heuristic_priority(deal)


# ---------------------------------------------------------------------------
# Celery tasks
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=3)
def analyze_deal_ai_metadata(self, deal_id):
    """
    AIOps triage task: enriches deal.ai_metadata with Gemini analysis.
    Falls back to heuristic when Gemini is not available.
    """
    Deal = apps.get_model("crm", "Deal")
    TenantModule = apps.get_model("module_manager", "TenantModule")

    try:
        deal = Deal.all_objects.select_related("company").get(id=deal_id)

        is_ai_active = TenantModule.all_objects.filter(
            company=deal.company, module__code="ai", is_active=True
        ).exists()
        if not is_ai_active:
            return "ai_module_inactive"

        if not deal.description or len(deal.description) < 10:
            return "description_too_short"

        suggestion = suggest_deal_priority_ai(deal_id)
        suggestion["processed_at"] = timezone.now().isoformat()

        deal.ai_metadata = suggestion
        deal.save(update_fields=["ai_metadata"])
        return f"AI analysis complete for deal {deal_id} (source={suggestion.get('source')})"

    except Exception as exc:
        logger.error("Error in AI triage for deal %s: %s", deal_id, exc)
        raise self.retry(exc=exc, countdown=60)


@shared_task
def get_kb_suggestions_ai(deal_id):
    """RAG: suggest KB articles related to a CRM deal."""
    Deal = apps.get_model("crm", "Deal")
    Article = apps.get_model("articles", "Article")

    try:
        deal = Deal.all_objects.get(id=deal_id)

        # Try to enrich the query with Gemini-extracted keywords
        keywords = deal.title[:20]
        raw = _call_gemini(
            f"Extract 3 search keywords from this IT ticket title. "
            f"Return only the keywords separated by spaces, no punctuation.\n\nTitle: {deal.title}"
        )
        if raw:
            keywords = raw.strip()

        articles = Article.objects.filter(
            company=deal.company, status="published"
        ).filter(
            Q(title__icontains=keywords) | Q(content__icontains=keywords)
        )[:3]

        return [
            {"id": a.id, "title": a.title, "slug": a.slug, "excerpt": a.excerpt or a.content[:150]}
            for a in articles
        ]
    except Exception as exc:
        logger.error("Error in KB AI suggestions: %s", exc)
        return []
