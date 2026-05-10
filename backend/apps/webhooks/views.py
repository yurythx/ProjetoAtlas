from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response

from apps.accounts.permissions import HasRolePermission
from shared_kernel.audit import log_create, log_delete, log_update

from .models import WebhookDelivery, WebhookSubscription
from .serializers import WebhookSubscriptionSerializer
from .tasks import dispatch_webhook


class WebhookSubscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = WebhookSubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    required_permission = "settings.webhooks_manage"
    pagination_class = None

    def get_queryset(self):
        return WebhookSubscription.objects.filter(company=self.request.company)

    def perform_create(self, serializer):
        obj = serializer.save(company=self.request.company)
        log_create(self.request.user, "WebhookSubscription", obj, request=self.request)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_update(self.request.user, "WebhookSubscription", obj, request=self.request)

    def perform_destroy(self, instance):
        log_delete(self.request.user, "WebhookSubscription", instance, request=self.request)
        instance.delete()

    @action(detail=True, methods=['get'])
    def deliveries(self, request, pk=None):
        """
        Retorna os logs de entrega (WebhookDelivery) para uma assinatura específica.
        """
        subscription = self.get_object()
        deliveries = WebhookDelivery.objects.filter(subscription=subscription)[:50]

        data = [
            {
                "id": d.id,
                "event_name": d.event_name,
                "status_code": d.status_code,
                "success": d.success,
                "request_payload": d.request_payload,
                "response_body": d.response_body,
                "attempt_number": d.attempt_number,
                "created_at": d.created_at
            }
            for d in deliveries
        ]
        return Response(data)

    @action(detail=True, methods=["post"], url_path="deliveries/retry")
    def retry_delivery(self, request, pk=None):
        """Re-dispatch a previously failed webhook delivery."""
        subscription = self.get_object()
        delivery_id = request.data.get("delivery_id")
        if not delivery_id:
            return Response({"detail": "delivery_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        delivery = get_object_or_404(WebhookDelivery, pk=delivery_id, subscription=subscription)
        dispatch_webhook.delay(subscription.id, delivery.event_name, delivery.request_payload)
        return Response({"detail": "Reenvio agendado."}, status=status.HTTP_202_ACCEPTED)
