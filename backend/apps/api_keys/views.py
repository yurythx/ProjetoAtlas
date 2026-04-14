from rest_framework import permissions, viewsets

from apps.accounts.permissions import HasRolePermission
from shared_kernel.audit import log_create, log_delete, log_update

from .models import APIKey
from .serializers import APIKeySerializer


class APIKeyViewSet(viewsets.ModelViewSet):
    serializer_class = APIKeySerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    required_permission = "settings.api_keys_manage"
    pagination_class = None

    def get_queryset(self):
        return APIKey.objects.filter(company=self.request.company)

    def perform_create(self, serializer):
        obj = serializer.save()
        log_create(self.request.user, "APIKey", obj, request=self.request)

    def perform_update(self, serializer):
        obj = serializer.save()
        log_update(self.request.user, "APIKey", obj, request=self.request)

    def perform_destroy(self, instance):
        log_delete(self.request.user, "APIKey", instance, request=self.request)
        instance.delete()
