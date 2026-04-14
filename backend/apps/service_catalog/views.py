from rest_framework import viewsets, permissions
from .models import ServiceCategory, ServiceDefinition, ServiceItem
from .serializers import ServiceCategorySerializer, ServiceDefinitionSerializer, ServiceItemSerializer

class ServiceBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        company = getattr(self.request, "company", None)
        if not company:
            return self.queryset.model.all_objects.none()
        return self.queryset.model.all_objects.filter(company=company)

    def perform_create(self, serializer):
        serializer.save(company=self.request.company)

class ServiceCategoryViewSet(ServiceBaseViewSet):
    queryset = ServiceCategory.all_objects.all()
    serializer_class = ServiceCategorySerializer
    search_fields = ["name", "description"]

class ServiceDefinitionViewSet(ServiceBaseViewSet):
    queryset = ServiceDefinition.all_objects.all()
    serializer_class = ServiceDefinitionSerializer
    search_fields = ["name", "description"]
    filterset_fields = ["category", "is_active"]

class ServiceItemViewSet(ServiceBaseViewSet):
    queryset = ServiceItem.all_objects.all()
    serializer_class = ServiceItemSerializer
    search_fields = ["name", "description"]
    filterset_fields = ["definition", "record_type", "is_active"]
