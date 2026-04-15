from rest_framework import viewsets, permissions, parsers
from .models import Media
from .serializers import MediaSerializer
from apps.module_manager.permissions import HasModuleAccess
from apps.accounts.permissions import ActionRolePermission
import logging

logger = logging.getLogger(__name__)


class MediaViewSet(viewsets.ModelViewSet):
    queryset = Media.objects.all()
    serializer_class = MediaSerializer
    parser_classes = (parsers.MultiPartParser, parsers.FormParser)
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]

    # Permissões granulares por action — gerenciadas por ActionRolePermission.
    # Isso elimina a necessidade de verificar permissões manualmente em perform_create/destroy.
    action_permissions = {
        'list':     'media.media_view',
        'retrieve': 'media.media_view',
        'create':   'media.media_upload',
        'update':   'media.media_upload',
        'partial_update': 'media.media_upload',
        'destroy':  'media.media_delete',
    }
    module_code = 'media'
    pagination_class = None

    def get_queryset(self):
        if hasattr(self.request, 'company') and self.request.company:
            return Media.objects.filter(company=self.request.company)
        return Media.all_objects.none()

    def perform_create(self, serializer):
        # Permission already verified by ActionRolePermission before this point.
        logger.info(f"Iniciando upload de mídia. User: {self.request.user}, Company: {self.request.company}")
        instance = serializer.save(company=self.request.company)
        logger.info(f"Upload concluído com sucesso. ID: {instance.id}, File: {instance.file.name}")

    def perform_destroy(self, instance):
        # Permission already verified by ActionRolePermission before this point.
        instance.delete()
