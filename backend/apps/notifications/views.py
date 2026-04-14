from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification, PushSubscription
from .serializers import NotificationSerializer, PushSubscriptionSerializer


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        # Queryset base sem slice para que get_object() funcione corretamente
        # O slice de 50 é aplicado somente no list() abaixo (MN1)
        return Notification.objects.filter(recipient=self.request.user).order_by("-created_at")

    def list(self, request, *args, **kwargs):
        # MN1: limita a 50 mais recentes para evitar sobrecarga em usuários com histórico longo
        queryset = self.get_queryset()[:50]
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    # Bug N2: Notificações são criadas apenas por signals/tasks — bloquear criação via API
    def create(self, request, *args, **kwargs):
        return Response(
            {"detail": "Notificações não podem ser criadas diretamente via API."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=False, methods=["post"])
    def mark_all_as_read(self, request):
        # Usa filter direto (sem slice) para update em bulk
        Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
        return Response({"status": "success"})

    @action(detail=True, methods=["post"])
    def mark_as_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response({"status": "success"})


class PushSubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = PushSubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        # Bug N3: filtrar por user E company para garantir isolamento cross-tenant
        return PushSubscription.objects.filter(user=self.request.user, company=self.request.company)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, company=self.request.company)
