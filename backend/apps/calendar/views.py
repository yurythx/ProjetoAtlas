import logging

from dateutil import rrule
from dateutil.parser import parse
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.response import Response

from apps.accounts.permissions import ActionRolePermission
from apps.module_manager.permissions import HasModuleAccess

from .models import Event
from .serializers import EventSerializer

logger = logging.getLogger(__name__)


class EventViewSet(viewsets.ModelViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    module_code = "calendar"
    pagination_class = None
    required_permission = "calendar.event_view"
    action_permissions = {
        "list": "calendar.event_view",
        "retrieve": "calendar.event_view",
        "create": "calendar.event_manage",
        "update": "calendar.event_manage",
        "partial_update": "calendar.event_manage",
        "destroy": "calendar.event_manage",
    }

    def get_queryset(self):
        user = getattr(self.request, "user", None)
        company = getattr(self.request, "company", None)
        if not user or not user.is_authenticated:
            return Event.all_objects.none()

        if user.is_superuser:
            if company:
                return Event.all_objects.filter(company=company)
            return Event.all_objects.all()

        if not company:
            return Event.all_objects.none()

        qs = Event.all_objects.filter(company=company)
        perms = getattr(getattr(user, "role", None), "permissions", None)
        if isinstance(perms, list) and ("*" in perms or "calendar.event_manage" in perms):
            return qs
        return qs.filter(owner=user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, company=self.request.company)

    def list(self, request, *args, **kwargs):
        """
        Custom list to handle recurrence expansion.
        Query Params: start (ISO8601), end (ISO8601)
        """
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")

        # Se não passar datas, comporta-se como listagem normal paginada (para admin/tabelas)
        if not start_str or not end_str:
            return super().list(request, *args, **kwargs)

        try:
            start_dt = parse(start_str)
            end_dt = parse(end_str)
            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(start_dt)
            if timezone.is_naive(end_dt):
                end_dt = timezone.make_aware(end_dt)
        except ValueError:
            return Response({"error": "Invalid date format"}, status=400)

        # 1. Eventos normais no range
        # Filtra onde (start < end_range) E (end > start_range) para pegar overlaps
        normal_events = self.get_queryset().filter(
            rrule__isnull=True, start_datetime__lt=end_dt, end_datetime__gt=start_dt
        )

        # 2. Eventos recorrentes (pegar todos do tenant e expandir em memória)
        # Otimização futura: filtrar recorrentes que começaram antes do end_dt
        recurrent_events = self.get_queryset().filter(rrule__isnull=False).exclude(rrule="")

        expanded_events = []

        # Serializa os normais
        normal_data = self.get_serializer(normal_events, many=True).data
        expanded_events.extend(normal_data)

        # Expande os recorrentes
        for event in recurrent_events:
            try:
                # Parse rrule string
                # RFC 5545 string from DB
                rule = rrule.rrulestr(event.rrule, dtstart=event.start_datetime)

                # Get instances between start and end
                # inc=True inclui o start se coincidir
                instances = rule.between(start_dt, end_dt, inc=True)

                duration = event.end_datetime - event.start_datetime

                for dt in instances:
                    # Serializa o evento base e ajusta datas
                    # Clonar dict é mais rápido que instanciar Model
                    event_data = EventSerializer(event).data

                    # Ajusta IDs para o frontend (FullCalendar precisa de IDs únicos)
                    # Ex: uuid_timestamp
                    instance_start = dt
                    if timezone.is_naive(instance_start):
                        instance_start = timezone.make_aware(instance_start)

                    event_data["id"] = f"{event.uuid}_{int(instance_start.timestamp())}"
                    event_data["start_datetime"] = instance_start.isoformat()
                    event_data["end_datetime"] = (instance_start + duration).isoformat()
                    # Marcar como instância virtual
                    event_data["is_recurrence"] = True
                    event_data["original_event_id"] = event.id

                    expanded_events.append(event_data)

            except Exception as e:
                logger.error(f"Error expanding recurrence for event {event.id}: {e}")
                continue

        return Response(expanded_events)
