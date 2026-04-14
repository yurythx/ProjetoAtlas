from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ContactBlockViewSet, ContactViewSet, ConversationViewSet, MessageViewSet

router = DefaultRouter()
router.register(r"conversations", ConversationViewSet, basename="conversations")
router.register(r"contacts", ContactViewSet, basename="contacts")
router.register(r"messages", MessageViewSet, basename="messages")
router.register(r"blocks", ContactBlockViewSet, basename="blocks")

urlpatterns = [
    path("", include(router.urls)),
]
