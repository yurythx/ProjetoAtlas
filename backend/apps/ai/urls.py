from django.urls import path
from .views import AIKBSuggestionsAPIView

urlpatterns = [
    path("kb-suggestions/<int:deal_id>/", AIKBSuggestionsAPIView.as_view(), name="ai-kb-suggestions"),
]
