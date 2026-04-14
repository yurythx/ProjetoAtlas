import ipaddress
import logging
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import exceptions, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import ActionRolePermission
from apps.module_manager.permissions import HasModuleAccess
from shared_kernel.sanitization import sanitize_url

from .models import ContactBlock, Conversation, Message
from .serializers import (
    ContactBlockSerializer,
    ContactSerializer,
    ConversationSerializer,
    MessageSearchSerializer,
    MessageSerializer,
)
from .services import MessengerService

logger = logging.getLogger(__name__)

User = get_user_model()


@extend_schema_view(
    list=extend_schema(tags=["Messenger"]),
    retrieve=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
)
class ContactViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    required_permission = "messenger.view"
    module_code = "messenger"
    action_permissions = {
        "list": "messenger.view",
        "retrieve": "messenger.view",
    }

    def get_queryset(self):
        user = self.request.user
        company = self.request.company

        if not user or not user.is_authenticated:
            return User.all_objects.none()

        logger.debug(f"ContactViewSet: User {user.username} (ID: {user.id}) fetching contacts for Company {company}")

        # Superusers use all_objects for global visibility if no company context is set.
        if user.is_superuser:
            if company:
                qs = User.objects.filter(is_active=True).exclude(id=user.id)
            else:
                qs = User.all_objects.filter(is_active=True).exclude(id=user.id)
        else:
            if not company:
                logger.warning(f"ContactViewSet: User {user.username} has no company context. Returning empty.")
                return User.objects.none()

            if user.is_staff:
                qs = User.objects.filter(company=company, is_active=True).exclude(id=user.id)
            else:
                group_ids = list(user.groups.values_list("id", flat=True))
                if not group_ids:
                    return User.objects.none()
                qs = (
                    User.objects.filter(company=company, is_active=True, groups__in=group_ids)
                    .exclude(id=user.id)
                    .distinct()
                )

        return qs.prefetch_related("groups").order_by("username")


@extend_schema_view(
    list=extend_schema(tags=["Messenger"]),
    create=extend_schema(tags=["Messenger"]),
    retrieve=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
    destroy=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
)
class ContactBlockViewSet(viewsets.ModelViewSet):
    serializer_class = ContactBlockSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    required_permission = "messenger.view"
    module_code = "messenger"
    action_permissions = {
        "list": "messenger.view",
        "retrieve": "messenger.view",
        "create": "messenger.view",
        "destroy": "messenger.view",
        "update": "messenger.view",
        "partial_update": "messenger.view",
    }

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return ContactBlock.objects.none()
        return ContactBlock.objects.filter(blocker=user)

    def perform_create(self, serializer):
        serializer.save(blocker=self.request.user, company=self.request.company)


@extend_schema_view(
    list=extend_schema(tags=["Messenger"]),
    retrieve=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
    create=extend_schema(tags=["Messenger"]),
    update=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
    partial_update=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
    destroy=extend_schema(
        tags=["Messenger"], parameters=[OpenApiParameter("id", OpenApiTypes.INT, location=OpenApiParameter.PATH)]
    ),
)
class ConversationViewSet(viewsets.ModelViewSet):
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    required_permission = "messenger.view"
    module_code = "messenger"
    action_permissions = {
        "list": "messenger.view",
        "retrieve": "messenger.view",
        "create": "messenger.view",
        "update": "messenger.view",
        "partial_update": "messenger.view",
        "destroy": "messenger.view",
        "archived": "messenger.view",
        "deleted": "messenger.view",
        "find_by_participant": "messenger.view",
        "mute": "messenger.view",
        "unmute": "messenger.view",
        "pin": "messenger.view",
        "unpin": "messenger.view",
        "delete_for_me": "messenger.view",
        "restore_for_me": "messenger.view",
        "archive_for_me": "messenger.view",
        "unarchive_for_me": "messenger.view",
        "clear_for_me": "messenger.view",
        "unclear_for_me": "messenger.view",
        "search": "messenger.view",
        "send_message": "messenger.view",
        "messages": "messenger.view",
    }

    def create(self, request, *args, **kwargs):
        participant_usernames = request.data.get("participant_usernames", [])
        target_username = request.data.get("target_username")
        if target_username and target_username not in participant_usernames:
            participant_usernames.append(target_username)

        conversation = MessengerService.create_conversation(
            creator=request.user,
            company=request.company,
            participant_usernames=participant_usernames,
            title=request.data.get("title"),
            is_group=request.data.get("is_group", False),
        )
        serializer = self.get_serializer(conversation)

        # If created, return 201. If it was an existing one (handled by service),
        # technically 200 is better but 201 is fine for now.
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Conversation.all_objects.none()

        from datetime import UTC, datetime

        from django.db.models import Count, DateTimeField, OuterRef, Prefetch, Subquery, Value
        from django.db.models.functions import Coalesce

        from .models import ConversationPreference

        # Use all_objects for superusers only if no company context exists.
        if user.is_superuser:
            if self.request.company:
                manager = Conversation.objects
            else:
                manager = Conversation.all_objects
        else:
            manager = Conversation.objects

        pref_qs = ConversationPreference.objects.filter(user=user)
        cleared_at_qs = pref_qs.filter(conversation=OuterRef("pk")).values("cleared_at")[:1]
        qs_min_dt = Value(datetime(1970, 1, 1, tzinfo=UTC), output_field=DateTimeField())

        last_msg_qs = Message.objects.filter(conversation=OuterRef("pk")).order_by("-created_at")
        unread_count_qs = (
            Message.objects.filter(conversation=OuterRef("pk"), is_deleted=False)
            .exclude(sender_id=user.id)
            .exclude(reads__user_id=user.id)
            .filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt))
            .values("conversation")
            .annotate(c=Count("id"))
            .values("c")
        )

        qs = (
            manager.filter(participants=user)
            .select_related("company")
            .prefetch_related(
                "participants",
                Prefetch("preferences", queryset=pref_qs, to_attr="prefetched_pref"),
            )
            .annotate(cleared_at=Subquery(cleared_at_qs))
            .annotate(
                unread_count=Coalesce(Subquery(unread_count_qs[:1]), 0),
                # Annotate last message details using Subqueries (Performance #26)
                last_msg_id=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values("id")[:1]
                ),
                last_msg_content=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values("content")[:1]
                ),
                last_msg_sender_id=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values("sender_id")[
                        :1
                    ]
                ),
                last_msg_sender_username=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values(
                        "sender__username"
                    )[:1]
                ),
                last_msg_created_at=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values("created_at")[
                        :1
                    ]
                ),
                last_msg_file_name=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values("file_name")[
                        :1
                    ]
                ),
                last_msg_file_type=Subquery(
                    last_msg_qs.filter(created_at__gt=Coalesce(OuterRef("cleared_at"), qs_min_dt)).values("file_type")[
                        :1
                    ]
                ),
            )
            .order_by("-updated_at")
        )
        if self.action == "list":
            qs = qs.exclude(preferences__user=user, preferences__is_deleted=True).exclude(
                preferences__user=user, preferences__is_archived=True
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {"error": "Use delete_for_me to remove a conversation from your view."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["get"])
    def archived(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response([])

        from django.db.models import Count, OuterRef, Prefetch, Subquery
        from django.db.models.functions import Coalesce

        from .models import ConversationPreference

        last_msg_qs = Message.objects.filter(conversation=OuterRef("pk")).order_by("-created_at")
        pref_qs = ConversationPreference.objects.filter(user=user)

        unread_count_qs = (
            Message.objects.filter(conversation=OuterRef("pk"), is_deleted=False)
            .exclude(sender_id=user.id)
            .exclude(reads__user_id=user.id)
            .values("conversation")
            .annotate(c=Count("id"))
            .values("c")
        )

        qs = (
            Conversation.objects.filter(participants=user, company=request.company)
            .filter(preferences__user=user, preferences__is_archived=True)
            .exclude(preferences__user=user, preferences__is_deleted=True)
            .select_related("company")
            .prefetch_related(
                "participants",
                Prefetch("preferences", queryset=pref_qs, to_attr="prefetched_pref"),
            )
            .annotate(
                unread_count=Coalesce(Subquery(unread_count_qs[:1]), 0),
                last_msg_id=Subquery(last_msg_qs.values("id")[:1]),
                last_msg_content=Subquery(last_msg_qs.values("content")[:1]),
                last_msg_sender_id=Subquery(last_msg_qs.values("sender_id")[:1]),
                last_msg_sender_username=Subquery(last_msg_qs.values("sender__username")[:1]),
                last_msg_created_at=Subquery(last_msg_qs.values("created_at")[:1]),
                last_msg_file_name=Subquery(last_msg_qs.values("file_name")[:1]),
                last_msg_file_type=Subquery(last_msg_qs.values("file_type")[:1]),
            )
            .order_by("-updated_at")
        )

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def deleted(self, request):
        user = request.user
        if not user or not user.is_authenticated:
            return Response([])

        from django.db.models import Count, OuterRef, Prefetch, Subquery
        from django.db.models.functions import Coalesce

        from .models import ConversationPreference

        last_msg_qs = Message.objects.filter(conversation=OuterRef("pk")).order_by("-created_at")
        pref_qs = ConversationPreference.objects.filter(user=user)

        unread_count_qs = (
            Message.objects.filter(conversation=OuterRef("pk"), is_deleted=False)
            .exclude(sender_id=user.id)
            .exclude(reads__user_id=user.id)
            .values("conversation")
            .annotate(c=Count("id"))
            .values("c")
        )

        qs = (
            Conversation.objects.filter(participants=user, company=request.company)
            .filter(preferences__user=user, preferences__is_deleted=True)
            .select_related("company")
            .prefetch_related(
                "participants",
                Prefetch("preferences", queryset=pref_qs, to_attr="prefetched_pref"),
            )
            .annotate(
                unread_count=Coalesce(Subquery(unread_count_qs[:1]), 0),
                last_msg_id=Subquery(last_msg_qs.values("id")[:1]),
                last_msg_content=Subquery(last_msg_qs.values("content")[:1]),
                last_msg_sender_id=Subquery(last_msg_qs.values("sender_id")[:1]),
                last_msg_sender_username=Subquery(last_msg_qs.values("sender__username")[:1]),
                last_msg_created_at=Subquery(last_msg_qs.values("created_at")[:1]),
                last_msg_file_name=Subquery(last_msg_qs.values("file_name")[:1]),
                last_msg_file_type=Subquery(last_msg_qs.values("file_type")[:1]),
            )
            .order_by("-updated_at")
        )

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def find_by_participant(self, request):
        target_username = request.query_params.get("username")
        if not target_username:
            return Response({"error": "username param required"}, status=400)

        try:
            target_user = User.objects.get(username=target_username, company=request.company)
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

        from django.db.models import Count

        # Find private conversation with exactly these participants
        qs = Conversation.objects.filter(is_group=False, participants=request.user)

        if target_user.id == request.user.id:
            # Self-chat: only 1 participant
            conversation = qs.annotate(p_count=Count("participants")).filter(p_count=1).first()
        else:
            # 1:1 Chat: exactly 2 participants
            conversation = (
                qs.filter(participants=target_user).annotate(p_count=Count("participants")).filter(p_count=2).first()
            )

        if conversation:
            serializer = self.get_serializer(conversation)
            return Response(serializer.data)
        else:
            # Retorna 204 No Content para indicar que não existe conversa,
            # evitando erro 404 no console do navegador que assusta o usuário.
            return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def add_participant(self, request, pk=None):
        conversation = self.get_object()
        if not conversation.is_group:
            return Response({"error": "Only group conversations can have participants added"}, status=400)

        username = request.data.get("username")
        try:
            target_user = User.objects.get(company=request.company, username=username)
            conversation.participants.add(target_user)
            return Response({"status": "Participant added"})
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

    @action(detail=True, methods=["post"])
    def remove_participant(self, request, pk=None):
        conversation = self.get_object()
        if not conversation.is_group:
            return Response({"error": "Only group conversations can have participants removed"}, status=400)

        username = request.data.get("username")
        try:
            target_user = User.objects.get(company=request.company, username=username)
            conversation.participants.remove(target_user)
            return Response({"status": "Participant removed"})
        except User.DoesNotExist:
            return Response({"error": "User not found"}, status=404)

    # ── Mute / Unmute / Pin / Unpin ──────────────────────────────────────────

    def _get_or_create_preference(self, request, conversation):
        from .models import ConversationPreference

        pref, _ = ConversationPreference.all_objects.get_or_create(
            user=request.user, conversation=conversation, defaults={"company": request.company or conversation.company}
        )
        return pref

    @action(detail=True, methods=["post"])
    def mute(self, request, pk=None):
        """Silence notifications for this conversation."""
        pref = self._get_or_create_preference(request, self.get_object())
        pref.is_muted = True
        pref.save(update_fields=["is_muted"])
        return Response({"is_muted": True})

    @action(detail=True, methods=["post"])
    def unmute(self, request, pk=None):
        """Re-enable notifications for this conversation."""
        pref = self._get_or_create_preference(request, self.get_object())
        pref.is_muted = False
        pref.save(update_fields=["is_muted"])
        return Response({"is_muted": False})

    @action(detail=True, methods=["post"])
    def pin(self, request, pk=None):
        """Pin this conversation to the top of the list."""
        pref = self._get_or_create_preference(request, self.get_object())
        pref.is_pinned = True
        pref.save(update_fields=["is_pinned"])
        return Response({"is_pinned": True})

    @action(detail=True, methods=["post"])
    def unpin(self, request, pk=None):
        """Unpin this conversation."""
        pref = self._get_or_create_preference(request, self.get_object())
        pref.is_pinned = False
        pref.save(update_fields=["is_pinned"])
        return Response({"is_pinned": False})

    @action(detail=True, methods=["post"])
    def mark_all_read(self, request, pk=None):
        """Mark all messages in this conversation as read for the current user."""
        conversation = self.get_object()
        user = request.user
        if not user.is_authenticated:
            return Response({"error": "Auth required"}, status=401)

        from .models import MessageRead

        unread_qs = (
            Message.all_objects.filter(conversation=conversation, is_deleted=False)
            .exclude(sender_id=user.id)
            .exclude(reads__user_id=user.id)
        )
        message_ids = list(unread_qs.values_list("id", flat=True))
        if not message_ids:
            return Response({"marked_read": 0})

        MessageRead.objects.bulk_create(
            [MessageRead(company=conversation.company, message_id=mid, user=user) for mid in message_ids],
            ignore_conflicts=True,
        )

        if not conversation.is_group:
            unread_qs.update(is_read=True)

        MessengerService.broadcast_all_read(request.company, conversation, user.id)
        return Response({"marked_read": len(message_ids)})

    @action(detail=True, methods=["post"])
    def delete_for_me(self, request, pk=None):
        conversation = self.get_object()
        pref = self._get_or_create_preference(request, conversation)
        pref.is_deleted = True
        pref.deleted_at = timezone.now()
        pref.save(update_fields=["is_deleted", "deleted_at"])
        return Response({"is_deleted": True})

    @action(detail=True, methods=["post"])
    def restore_for_me(self, request, pk=None):
        conversation = (
            Conversation.objects.filter(participants=request.user, id=pk, company=request.company)
            .select_related("company")
            .first()
        )
        if not conversation:
            return Response(status=status.HTTP_404_NOT_FOUND)
        pref = self._get_or_create_preference(request, conversation)
        pref.is_deleted = False
        pref.deleted_at = None
        pref.save(update_fields=["is_deleted", "deleted_at"])
        return Response({"is_deleted": False})

    @action(detail=True, methods=["post"])
    def archive_for_me(self, request, pk=None):
        conversation = self.get_object()
        pref = self._get_or_create_preference(request, conversation)
        pref.is_archived = True
        pref.archived_at = timezone.now()
        pref.save(update_fields=["is_archived", "archived_at"])
        return Response({"is_archived": True})

    @action(detail=True, methods=["post"])
    def unarchive_for_me(self, request, pk=None):
        conversation = (
            Conversation.objects.filter(participants=request.user, id=pk, company=request.company)
            .select_related("company")
            .first()
        )
        if not conversation:
            return Response(status=status.HTTP_404_NOT_FOUND)
        pref = self._get_or_create_preference(request, conversation)
        pref.is_archived = False
        pref.archived_at = None
        pref.save(update_fields=["is_archived", "archived_at"])
        return Response({"is_archived": False})

    @action(detail=True, methods=["post"])
    def clear_for_me(self, request, pk=None):
        conversation = self.get_object()
        pref = self._get_or_create_preference(request, conversation)
        pref.cleared_at = timezone.now()
        pref.save(update_fields=["cleared_at"])
        return Response({"cleared_at": pref.cleared_at.isoformat() if pref.cleared_at else None})

    @action(detail=True, methods=["post"])
    def unclear_for_me(self, request, pk=None):
        conversation = self.get_object()
        pref = self._get_or_create_preference(request, conversation)
        pref.cleared_at = None
        pref.save(update_fields=["cleared_at"])
        return Response({"cleared_at": None})

    @extend_schema(
        parameters=[OpenApiParameter("q", OpenApiTypes.STR, description="Termo de pesquisa")],
        responses={200: MessageSearchSerializer(many=True)},
        description="Global search in message history",
    )
    @action(detail=False, methods=["get"])
    def search(self, request):
        query = request.query_params.get("q")
        if not query:
            return Response({"error": "Query parameter 'q' is required"}, status=400)

        from django.db.models import Q

        messages = (
            Message.objects.filter(conversation__participants=request.user)
            .filter(Q(content__icontains=query) | Q(file_name__icontains=query))
            .select_related("conversation")
            .prefetch_related("conversation__participants")
            .order_by("-created_at")
        )

        page = self.paginate_queryset(messages)
        if page is not None:
            serializer = MessageSearchSerializer(page, many=True, context={"request": request})
            return self.get_paginated_response(serializer.data)

        serializer = MessageSearchSerializer(messages, many=True, context={"request": request})
        return Response(serializer.data)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={201: MessageSerializer},
        description="Send a message to this conversation (supports content and/or file)",
    )
    @action(detail=True, methods=["post"])
    def send_message(self, request, pk=None):
        conversation = self.get_object()
        content = request.data.get("content")
        file_obj = request.FILES.get("file")
        reply_to_id = request.data.get("reply_to_id")
        client_id = request.data.get("client_id")

        if not content and not file_obj:
            return Response({"error": "Content or file is required"}, status=status.HTTP_400_BAD_REQUEST)

        if client_id:
            try:
                import uuid

                client_id = uuid.UUID(str(client_id))
            except Exception:
                client_id = None

        message = MessengerService.send_message(
            user=request.user,
            company=request.company,
            conversation=conversation,
            content=content,
            file_obj=file_obj,
            request=request,
            reply_to_id=reply_to_id,
            client_id=client_id,
        )

        serializer = MessageSerializer(message, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        responses={200: MessageSerializer(many=True)},
        description="List messages in this conversation (supports ?before=<ISO datetime> for pagination)",
    )
    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        conversation = self.get_object()
        # Order by -created_at for pagination (latest first) then reverse for display
        from django.db.models import Count, Exists, OuterRef

        from .models import ConversationPreference, MessageDelivery, MessageRead

        qs = Message.all_objects.filter(conversation=conversation).annotate(
            read_by_me=Exists(MessageRead.objects.filter(message_id=OuterRef("pk"), user_id=request.user.id)),
            read_by_count=Count("reads", distinct=True),
            delivered_by_me=Exists(MessageDelivery.objects.filter(message_id=OuterRef("pk"), user_id=request.user.id)),
            delivered_by_count=Count("deliveries", distinct=True),
        ).prefetch_related("reactions", "reactions__user").select_related("sender")
        qs = qs.order_by("-created_at", "-id")

        cleared_at = (
            ConversationPreference.all_objects.filter(
                company=request.company, conversation=conversation, user=request.user
            )
            .values_list("cleared_at", flat=True)
            .first()
        )
        if cleared_at:
            qs = qs.filter(created_at__gt=cleared_at)

        before = request.query_params.get("before")
        if before:
            try:
                from django.utils.dateparse import parse_datetime

                dt = parse_datetime(before)
                if dt:
                    qs = qs.filter(created_at__lt=dt)
            except Exception:
                pass

        # We want to return messages in chronological order for the frontend
        # but paginate from latest to oldest. list(reversed(...)) is O(n) not O(n log n) (#9 fix)
        page = self.paginate_queryset(qs)
        if page is not None:
            messages_list = list(reversed(page))
            serializer = MessageSerializer(
                messages_list,
                many=True,
                context={"request": request, "participants_count": conversation.participants.count()},
            )
            return self.get_paginated_response(serializer.data)

        messages_list = list(qs.order_by("created_at", "id"))
        serializer = MessageSerializer(
            messages_list,
            many=True,
            context={"request": request, "participants_count": conversation.participants.count()},
        )
        return Response(serializer.data)


@extend_schema_view(
    reaction=extend_schema(tags=["Messenger"], summary="Add or remove emoji reaction"),
    mark_read=extend_schema(tags=["Messenger"], summary="Mark message as read by recipient"),
    destroy=extend_schema(tags=["Messenger"], summary="Delete message (only sender)"),
    partial_update=extend_schema(tags=["Messenger"], summary="Edit message (only sender)"),
)
class MessageViewSet(mixins.DestroyModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, ActionRolePermission]
    required_permission = "messenger.view"
    module_code = "messenger"
    action_permissions = {
        "partial_update": "messenger.view",
        "destroy": "messenger.view",
        "link_preview": "messenger.view",
        "reaction": "messenger.view",
        "mark_read": "messenger.view",
        "receipts": "messenger.view",
    }

    def get_throttles(self):
        if getattr(self, "action", None) == "link_preview":
            self.throttle_scope = "link_preview"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        # Users can only interact with messages in conversations they are part of.
        # Always filter by company to enforce tenant isolation (#18 security fix).
        # Use all_objects to include soft-deleted messages in the chat history.
        user = self.request.user
        if not user or not user.is_authenticated:
            return Message.all_objects.none()

        manager = Message.all_objects
        qs = manager.filter(conversation__participants=user)
        if self.request.company:
            qs = qs.filter(conversation__company=self.request.company)
        return qs

    def perform_destroy(self, instance):
        if instance.sender != self.request.user:
            raise exceptions.PermissionDenied("You can only delete your own messages.")

        from datetime import timedelta

        from django.conf import settings

        window_seconds = int(getattr(settings, "MESSENGER_DELETE_FOR_ALL_WINDOW_SECONDS", 600))
        if instance.created_at < timezone.now() - timedelta(seconds=window_seconds):
            raise exceptions.PermissionDenied("Delete for everyone window has expired.")

        company = self.request.company
        conversation = instance.conversation
        message_id = instance.id

        # Soft delete: preserve thread integrity, clear content/file
        instance.soft_delete()

        MessengerService.broadcast_delete(company, conversation, message_id)

        from shared_kernel.audit import log_action

        log_action(
            self.request.user,
            action="delete",
            resource="Message",
            resource_id=message_id,
            details={"conversation_id": conversation.id, "scope": "everyone"},
            request=self.request,
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        if instance.sender != self.request.user:
            raise exceptions.PermissionDenied("You can only edit your own messages.")

        # Only allow updating content field
        if "content" not in serializer.validated_data:
            return

        instance.edited_at = timezone.now()
        # Save the new content AND the edited_at timestamp together
        serializer.save(edited_at=instance.edited_at)

        # Broadcast edit to all participants via WebSocket
        MessengerService.broadcast_edit(self.request.company, instance.conversation, instance)

    @action(detail=False, methods=["get"])
    def link_preview(self, request):
        def err(code, msg, status_code):
            return Response({"error_code": code, "message": msg}, status=status_code)

        url = request.query_params.get("url")
        if not url:
            return err("missing_url", "URL is required", status.HTTP_400_BAD_REQUEST)

        safe_url = sanitize_url(url, allowed_protocols=["http", "https"])
        if not safe_url:
            return err("invalid_url", "Invalid URL", status.HTTP_400_BAD_REQUEST)

        parsed = urlparse(safe_url)
        host = parsed.hostname or ""
        if host in ("localhost", "127.0.0.1"):
            return err("blocked_host", "Localhost not allowed", status.HTTP_400_BAD_REQUEST)
        try:
            ip = ipaddress.ip_address(host) if host.replace(".", "").isdigit() else None
            if ip and (ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local):
                return err("blocked_ip", "Private IP not allowed", status.HTTP_400_BAD_REQUEST)
        except ValueError:
            pass

        # Rate limit: 15 previews/minute per (company, user)
        # Uses atomic cache.add + cache.incr pattern to prevent race conditions.
        if not request.company:
            return err("no_company", "Company context required", status.HTTP_400_BAD_REQUEST)
        rl_key = f"lp:rl:{request.company.id}:{request.user.id}"
        # cache.add returns True only when the key did not exist (atomic)
        if not cache.add(rl_key, 1, timeout=60):
            try:
                count = cache.incr(rl_key)
            except ValueError:
                # Key expired between add and incr — reset
                cache.set(rl_key, 1, timeout=60)
                count = 1
            if count > 15:
                return err("rate_limited", "Rate limit exceeded", status.HTTP_429_TOO_MANY_REQUESTS)

        # Check cache first — return immediately if available
        import hashlib

        cache_key = f"lp:res:{hashlib.md5(safe_url.encode()).hexdigest()}"
        cached = cache.get(cache_key)
        if cached:
            return Response(cached)

        # Dispatch async Celery task to fetch the preview
        # Return 202 so the client can poll or retry in a moment
        from .tasks import fetch_link_preview

        fetch_link_preview.delay(safe_url, cache_key)
        return Response({"status": "processing", "url": safe_url}, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT},
        description="Add or remove a reaction to a message",
    )
    @action(detail=True, methods=["post"])
    def reaction(self, request, pk=None):
        message = self.get_object()
        emoji = request.data.get("emoji")
        action_type = request.data.get("action", "add")  # add or remove

        if not emoji:
            return Response({"error": "Emoji is required"}, status=status.HTTP_400_BAD_REQUEST)

        if action_type == "add":
            MessengerService.add_reaction(request.user, message, emoji)
        elif action_type == "remove":
            MessengerService.remove_reaction(request.user, message, emoji)
        else:
            return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"status": "success"})

    @extend_schema(
        request=None, responses={200: OpenApiTypes.OBJECT}, description="Mark a message as read (only if recipient)"
    )
    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        message = self.get_object()
        # Only allow marking as read if requester is participant and not the sender
        if message.sender_id == request.user.id:
            return Response({"error": "Sender cannot mark own message as read"}, status=status.HTTP_400_BAD_REQUEST)
        from .models import MessageRead

        MessageRead.objects.get_or_create(
            company=message.company,
            message=message,
            user=request.user,
        )

        if not message.conversation.is_group:
            message.is_read = True
            message.save(update_fields=["is_read"])

        # Broadcast to conversation group
        MessengerService.broadcast_read_receipt(request.company, message.conversation, message.id, request.user.id)

        return Response({"status": "success", "is_read": True})

    @extend_schema(responses={200: OpenApiTypes.OBJECT}, description="Get delivery/read receipts for this message")
    @action(detail=True, methods=["get"])
    def receipts(self, request, pk=None):
        message = self.get_object()
        if message.sender_id != request.user.id:
            raise exceptions.PermissionDenied("You can only view receipts for your own messages.")

        from .models import MessageDelivery, MessageRead

        deliveries_qs = (
            MessageDelivery.all_objects.filter(company=message.company, message=message)
            .select_related("user")
            .order_by("delivered_at")
        )
        reads_qs = (
            MessageRead.all_objects.filter(company=message.company, message=message)
            .select_related("user")
            .order_by("read_at")
        )

        deliveries = [
            {"user_id": d.user_id, "username": d.user.username, "delivered_at": d.delivered_at.isoformat()}
            for d in deliveries_qs
        ]
        reads = [
            {"user_id": r.user_id, "username": r.user.username, "read_at": r.read_at.isoformat()} for r in reads_qs
        ]

        deliveries_map = {d["user_id"]: d["delivered_at"] for d in deliveries}
        reads_map = {r["user_id"]: r["read_at"] for r in reads}

        participants = (
            message.conversation.participants.exclude(id=message.sender_id)
            .values("id", "username")
            .order_by("username")
        )
        recipients = []
        pending_delivered = []
        pending_read = []
        for p in participants:
            user_id = p["id"]
            username = p["username"]
            delivered_at = deliveries_map.get(user_id)
            read_at = reads_map.get(user_id)
            recipients.append(
                {
                    "user_id": user_id,
                    "username": username,
                    "delivered_at": delivered_at,
                    "read_at": read_at,
                    "is_delivered": delivered_at is not None,
                    "is_read": read_at is not None,
                }
            )
            if delivered_at is None:
                pending_delivered.append({"user_id": user_id, "username": username})
            if read_at is None:
                pending_read.append({"user_id": user_id, "username": username})

        return Response(
            {
                "message_id": message.id,
                "conversation_id": message.conversation_id,
                "delivered": deliveries,
                "read": reads,
                "delivered_count": len(deliveries),
                "read_count": len(reads),
                "recipients": recipients,
                "pending_delivered": pending_delivered,
                "pending_read": pending_read,
            }
        )
