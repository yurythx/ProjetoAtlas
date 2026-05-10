"""
Tests for apps/ai/tasks.py — Gemini integration + heuristic fallback.

Coverage:
- _call_gemini: no API key → None, exception → None, success → stripped text
- _heuristic_priority: HIGH/LOW/MEDIUM priority + record_type detection
- summarize_article_ai: cache hit, Gemini success, extractive fallback, missing article
- suggest_deal_priority_ai: valid JSON, markdown-fenced JSON, malformed JSON, Gemini off
- analyze_deal_ai_metadata: module inactive, description too short, success, retry on error
- get_kb_suggestions_ai: with Gemini keywords, without Gemini, deal not found
"""

import sys
from unittest.mock import MagicMock, patch

from django.test import TestCase

from factories import (
    ArticleFactory,
    ColumnFactory,
    CompanyFactory,
    DealFactory,
    ModuleFactory,
    PipelineFactory,
    TenantModuleFactory,
    UserFactory,
)


def _make_genai_mock(response_text: str) -> MagicMock:
    """Minimal google.generativeai stub that returns response_text from generate_content."""
    mock_genai = MagicMock()
    mock_model = MagicMock()
    mock_model.generate_content.return_value.text = response_text
    mock_genai.GenerativeModel.return_value = mock_model
    mock_genai.GenerationConfig = MagicMock(return_value={})
    return mock_genai


# ---------------------------------------------------------------------------
# _call_gemini — tested directly, so we patch sys.modules here
# ---------------------------------------------------------------------------


class CallGeminiTest(TestCase):
    def test_returns_none_when_api_key_is_empty(self):
        from apps.ai.tasks import _call_gemini

        with self.settings(GEMINI_API_KEY=""):
            result = _call_gemini("any prompt")

        self.assertIsNone(result)

    def test_returns_none_when_api_key_is_none(self):
        from apps.ai.tasks import _call_gemini

        with self.settings(GEMINI_API_KEY=None):
            result = _call_gemini("any prompt")

        self.assertIsNone(result)

    def test_returns_none_on_genai_exception(self):
        from apps.ai.tasks import _call_gemini

        mock_genai = MagicMock()
        mock_genai.GenerativeModel.side_effect = RuntimeError("network error")

        with self.settings(GEMINI_API_KEY="real-key"):
            with patch.dict(sys.modules, {"google.generativeai": mock_genai}):
                result = _call_gemini("any prompt")

        self.assertIsNone(result)

    def test_returns_stripped_text_on_success(self):
        from apps.ai.tasks import _call_gemini

        mock_genai = _make_genai_mock("  Summary of the article.  ")

        with self.settings(GEMINI_API_KEY="real-key"):
            with patch.dict(sys.modules, {"google.generativeai": mock_genai}):
                result = _call_gemini("Summarize this.")

        self.assertEqual(result, "Summary of the article.")

    def test_configure_is_called_with_api_key(self):
        from apps.ai.tasks import _call_gemini

        mock_genai = _make_genai_mock("ok")

        with self.settings(GEMINI_API_KEY="my-secret-key"):
            with patch.dict(sys.modules, {"google.generativeai": mock_genai}):
                _call_gemini("prompt")

        mock_genai.configure.assert_called_once_with(api_key="my-secret-key")


# ---------------------------------------------------------------------------
# _heuristic_priority — pure function, no DB needed
# ---------------------------------------------------------------------------


class HeuristicPriorityTest(TestCase):
    def _deal(self, title="Ticket", description=""):
        d = MagicMock()
        d.title = title
        d.description = description
        return d

    def test_urgente_in_title_gives_high(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(_heuristic_priority(self._deal("urgente problema"))["suggested_priority"], "HIGH")

    def test_critico_in_description_gives_high(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(
            _heuristic_priority(self._deal(description="falha crítica no servidor"))["suggested_priority"],
            "HIGH",
        )

    def test_melhoria_in_title_gives_low(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(_heuristic_priority(self._deal("melhoria no painel"))["suggested_priority"], "LOW")

    def test_default_priority_is_medium(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(_heuristic_priority(self._deal("Erro inesperado"))["suggested_priority"], "MEDIUM")

    def test_solicito_sets_service_request(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(
            _heuristic_priority(self._deal(description="solicito acesso ao sistema"))["suggested_record_type"],
            "service_request",
        )

    def test_melhoria_in_description_sets_change(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(
            _heuristic_priority(self._deal(description="melhoria no processo"))["suggested_record_type"],
            "change",
        )

    def test_default_record_type_is_incident(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(_heuristic_priority(self._deal("Erro inesperado"))["suggested_record_type"], "incident")

    def test_source_is_heuristic(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertEqual(_heuristic_priority(self._deal())["source"], "heuristic")

    def test_confidence_score_is_0_70(self):
        from apps.ai.tasks import _heuristic_priority

        self.assertAlmostEqual(_heuristic_priority(self._deal())["confidence_score"], 0.70)

    def test_high_priority_gets_ai_managed_category(self):
        from apps.ai.tasks import _heuristic_priority

        result = _heuristic_priority(self._deal("urgente servidor parado"))
        self.assertEqual(result["itil_v5_category"], "AI Managed")

    def test_non_high_priority_gets_standard_operation_category(self):
        from apps.ai.tasks import _heuristic_priority

        result = _heuristic_priority(self._deal("Configuração simples"))
        self.assertEqual(result["itil_v5_category"], "Standard Operation")


# ---------------------------------------------------------------------------
# summarize_article_ai
# ---------------------------------------------------------------------------


class SummarizeArticleAiTest(TestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        self.article = ArticleFactory(
            company=self.company,
            author=self.user,
            content="First sentence. Second sentence. Third sentence. Fourth sentence.",
            status="published",
        )

    def test_cache_hit_skips_gemini_and_returns_cached(self):
        from apps.ai.tasks import summarize_article_ai

        with patch("apps.ai.tasks.cache") as mock_cache, \
             patch("apps.ai.tasks._call_gemini") as mock_gemini:
            mock_cache.get.return_value = "cached summary"
            result = summarize_article_ai(self.article.id)

        self.assertEqual(result, "cached summary")
        mock_gemini.assert_not_called()

    def test_gemini_success_returns_and_caches_summary(self):
        from apps.ai.tasks import summarize_article_ai

        with patch("apps.ai.tasks.cache") as mock_cache, \
             patch("apps.ai.tasks._call_gemini", return_value="Gemini summary."):
            mock_cache.get.return_value = None
            result = summarize_article_ai(self.article.id)

        self.assertEqual(result, "Gemini summary.")
        mock_cache.set.assert_called_once()
        cached_value = mock_cache.set.call_args.args[1]
        self.assertEqual(cached_value, "Gemini summary.")

    def test_extractive_fallback_when_gemini_returns_none(self):
        from apps.ai.tasks import summarize_article_ai

        with patch("apps.ai.tasks.cache") as mock_cache, \
             patch("apps.ai.tasks._call_gemini", return_value=None):
            mock_cache.get.return_value = None
            result = summarize_article_ai(self.article.id)

        # Extractive: joins first 3 sentences from the article content
        self.assertIn("First sentence", result)
        self.assertIn("Second sentence", result)
        self.assertIn("Third sentence", result)

    def test_missing_article_returns_empty_string(self):
        from apps.ai.tasks import summarize_article_ai

        with patch("apps.ai.tasks.cache") as mock_cache:
            mock_cache.get.return_value = None
            result = summarize_article_ai(article_id=999_999)

        self.assertEqual(result, "")

    def test_cache_ttl_is_one_hour(self):
        from apps.ai.tasks import summarize_article_ai

        with patch("apps.ai.tasks.cache") as mock_cache, \
             patch("apps.ai.tasks._call_gemini", return_value="Summary."):
            mock_cache.get.return_value = None
            summarize_article_ai(self.article.id)

        timeout = mock_cache.set.call_args.kwargs.get("timeout") or mock_cache.set.call_args.args[2]
        self.assertEqual(timeout, 3600)


# ---------------------------------------------------------------------------
# suggest_deal_priority_ai
# ---------------------------------------------------------------------------


class SuggestDealPriorityAiTest(TestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        pipeline = PipelineFactory(company=self.company)
        col = ColumnFactory(company=self.company, pipeline=pipeline)
        self.deal = DealFactory(
            company=self.company,
            owner=self.user,
            column=col,
            title="Servidor fora do ar",
            description="O servidor de produção parou às 09h.",
        )

    def test_missing_deal_returns_empty_dict(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        result = suggest_deal_priority_ai(deal_id=999_999)
        self.assertEqual(result, {})

    def test_valid_json_from_gemini_parsed_and_tagged(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        gemini_json = (
            '{"suggested_priority":"HIGH","suggested_record_type":"incident",'
            '"reasoning":"Server is down."}'
        )
        with patch("apps.ai.tasks._call_gemini", return_value=gemini_json):
            result = suggest_deal_priority_ai(self.deal.id)

        self.assertEqual(result["suggested_priority"], "HIGH")
        self.assertEqual(result["source"], "gemini")
        self.assertIn("confidence_score", result)
        self.assertIn("itil_v5_category", result)

    def test_markdown_fenced_json_is_stripped_and_parsed(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        fenced = (
            "```json\n"
            '{"suggested_priority":"MEDIUM","suggested_record_type":"change","reasoning":"Minor."}'
            "\n```"
        )
        with patch("apps.ai.tasks._call_gemini", return_value=fenced):
            result = suggest_deal_priority_ai(self.deal.id)

        self.assertEqual(result["suggested_priority"], "MEDIUM")
        self.assertEqual(result["source"], "gemini")

    def test_malformed_gemini_json_falls_back_to_heuristic(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        with patch("apps.ai.tasks._call_gemini", return_value="not valid {{json}}"):
            result = suggest_deal_priority_ai(self.deal.id)

        self.assertEqual(result["source"], "heuristic")
        self.assertIn("suggested_priority", result)

    def test_gemini_none_falls_back_to_heuristic(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        with patch("apps.ai.tasks._call_gemini", return_value=None):
            result = suggest_deal_priority_ai(self.deal.id)

        self.assertEqual(result["source"], "heuristic")

    def test_high_priority_result_sets_ai_managed_category(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        gemini_json = (
            '{"suggested_priority":"HIGH","suggested_record_type":"incident","reasoning":"Down."}'
        )
        with patch("apps.ai.tasks._call_gemini", return_value=gemini_json):
            result = suggest_deal_priority_ai(self.deal.id)

        self.assertEqual(result["itil_v5_category"], "AI Managed")

    def test_critical_priority_result_sets_ai_managed_category(self):
        from apps.ai.tasks import suggest_deal_priority_ai

        gemini_json = (
            '{"suggested_priority":"CRITICAL","suggested_record_type":"incident","reasoning":"Down."}'
        )
        with patch("apps.ai.tasks._call_gemini", return_value=gemini_json):
            result = suggest_deal_priority_ai(self.deal.id)

        self.assertEqual(result["itil_v5_category"], "AI Managed")


# ---------------------------------------------------------------------------
# analyze_deal_ai_metadata (Celery task)
# ---------------------------------------------------------------------------


class AnalyzeDealAiMetadataTest(TestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        pipeline = PipelineFactory(company=self.company)
        col = ColumnFactory(company=self.company, pipeline=pipeline)
        self.deal = DealFactory(
            company=self.company,
            owner=self.user,
            column=col,
            title="Falha crítica no servidor",
            description="O servidor de produção está completamente fora do ar desde as 08h.",
        )
        # Create the AI module (code must be "ai")
        self.ai_module = ModuleFactory(code="ai", name="AI")

    def _activate_ai(self):
        TenantModuleFactory(company=self.company, module=self.ai_module, is_active=True)

    def test_returns_ai_module_inactive_when_module_disabled(self):
        from apps.ai.tasks import analyze_deal_ai_metadata

        result = analyze_deal_ai_metadata.apply(args=[self.deal.id])
        self.assertEqual(result.result, "ai_module_inactive")

    def test_returns_description_too_short_for_short_description(self):
        from apps.ai.tasks import analyze_deal_ai_metadata

        self._activate_ai()
        self.deal.description = "Erro"
        self.deal.save(update_fields=["description"])

        result = analyze_deal_ai_metadata.apply(args=[self.deal.id])
        self.assertEqual(result.result, "description_too_short")

    def test_success_saves_ai_metadata_on_deal(self):
        from apps.ai.tasks import analyze_deal_ai_metadata

        self._activate_ai()
        fake_suggestion = {
            "suggested_priority": "HIGH",
            "suggested_record_type": "incident",
            "reasoning": "Server is down.",
            "source": "heuristic",
            "confidence_score": 0.70,
        }

        with patch("apps.ai.tasks.suggest_deal_priority_ai", return_value=fake_suggestion):
            result = analyze_deal_ai_metadata.apply(args=[self.deal.id])

        self.deal.refresh_from_db()
        self.assertEqual(self.deal.ai_metadata["suggested_priority"], "HIGH")
        self.assertIn("processed_at", self.deal.ai_metadata)
        self.assertIn("AI analysis complete", result.result)

    def test_success_result_includes_source_in_message(self):
        from apps.ai.tasks import analyze_deal_ai_metadata

        self._activate_ai()
        fake_suggestion = {
            "suggested_priority": "MEDIUM",
            "suggested_record_type": "incident",
            "source": "gemini",
            "confidence_score": 0.95,
        }

        with patch("apps.ai.tasks.suggest_deal_priority_ai", return_value=fake_suggestion):
            result = analyze_deal_ai_metadata.apply(args=[self.deal.id])

        self.assertIn("gemini", result.result)

    def test_exception_triggers_retry(self):
        from apps.ai.tasks import analyze_deal_ai_metadata
        from celery.exceptions import Retry

        self._activate_ai()

        with patch("apps.ai.tasks.suggest_deal_priority_ai", side_effect=RuntimeError("Gemini timeout")):
            with self.assertRaises(Retry):
                analyze_deal_ai_metadata.apply(args=[self.deal.id], throw=True)


# ---------------------------------------------------------------------------
# get_kb_suggestions_ai (Celery task)
# ---------------------------------------------------------------------------


class GetKbSuggestionsAiTest(TestCase):
    def setUp(self):
        self.company = CompanyFactory()
        self.user = UserFactory(company=self.company)
        pipeline = PipelineFactory(company=self.company)
        col = ColumnFactory(company=self.company, pipeline=pipeline)
        self.deal = DealFactory(
            company=self.company,
            owner=self.user,
            column=col,
            title="SSO login failure",
            description="Users cannot authenticate via SSO.",
        )
        ArticleFactory.create_batch(
            2,
            company=self.company,
            author=self.user,
            status="published",
            title="SSO login failure troubleshooting",
        )

    def test_missing_deal_returns_empty_list(self):
        from apps.ai.tasks import get_kb_suggestions_ai

        result = get_kb_suggestions_ai.apply(args=[999_999])
        self.assertEqual(result.result, [])

    def test_gemini_keywords_used_in_article_search(self):
        from apps.ai.tasks import get_kb_suggestions_ai

        with patch("apps.ai.tasks._call_gemini", return_value="SSO login failure"):
            result = get_kb_suggestions_ai.apply(args=[self.deal.id])

        suggestions = result.result
        self.assertIsInstance(suggestions, list)
        # Articles match "SSO login failure" — expect results
        self.assertGreater(len(suggestions), 0)
        for s in suggestions:
            self.assertIn("id", s)
            self.assertIn("title", s)
            self.assertIn("slug", s)
            self.assertIn("excerpt", s)

    def test_falls_back_to_title_prefix_when_gemini_returns_none(self):
        from apps.ai.tasks import get_kb_suggestions_ai

        with patch("apps.ai.tasks._call_gemini", return_value=None):
            result = get_kb_suggestions_ai.apply(args=[self.deal.id])

        # deal.title[:20] = "SSO login failure" (< 20 chars) — articles still match
        suggestions = result.result
        self.assertIsInstance(suggestions, list)

    def test_result_capped_at_three_articles(self):
        from apps.ai.tasks import get_kb_suggestions_ai

        # Create extra articles that all match
        ArticleFactory.create_batch(
            5,
            company=self.company,
            author=self.user,
            status="published",
            title="SSO login failure extra",
        )

        with patch("apps.ai.tasks._call_gemini", return_value="SSO login failure"):
            result = get_kb_suggestions_ai.apply(args=[self.deal.id])

        self.assertLessEqual(len(result.result), 3)
