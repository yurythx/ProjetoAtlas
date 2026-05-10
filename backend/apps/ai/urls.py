from django.urls import path

from .views import AIArticleSummarizeAPIView, AIDealPrioritySuggestAPIView, AIKBSuggestionsAPIView

urlpatterns = [
    path("kb-suggestions/<int:deal_id>/", AIKBSuggestionsAPIView.as_view(), name="ai-kb-suggestions"),
    path("articles/<int:article_id>/summarize/", AIArticleSummarizeAPIView.as_view(), name="ai-article-summarize"),
    path("deals/<int:deal_id>/priority-suggest/", AIDealPrioritySuggestAPIView.as_view(), name="ai-deal-priority-suggest"),
]
