from rest_framework import viewsets, permissions
from .models import CIType, CI, CIRelationship
from .serializers import CITypeSerializer, CISerializer, CIRelationshipSerializer

class CMDBBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return self.queryset.model.all_objects.none()
        return self.queryset.model.all_objects.filter(company=company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)

class CITypeViewSet(CMDBBaseViewSet):
    queryset = CIType.all_objects.all()
    serializer_class = CITypeSerializer
    search_fields = ["name", "description"]

class CIViewSet(CMDBBaseViewSet):
    queryset = CI.all_objects.all()
    serializer_class = CISerializer
    search_fields = ["name", "serial_number", "asset_tag", "location"]
    filterset_fields = ["ci_type", "status", "owner"]

class CIRelationshipViewSet(CMDBBaseViewSet):
    queryset = CIRelationship.all_objects.all()
    serializer_class = CIRelationshipSerializer
    filterset_fields = ["source", "target", "relation_kind"]
