import logging

from rest_framework import permissions

logger = logging.getLogger(__name__)

# Definição centralizada de permissões e papéis padrão

AVAILABLE_PERMISSIONS = {
    # Artigos
    "articles.article_view": "Visualizar Artigos",
    "articles.article_create": "Criar Artigos",
    "articles.article_edit": "Editar Artigos",
    "articles.article_delete": "Excluir Artigos",
    "articles.article_publish": "Publicar Artigos",
    "articles.category_manage": "Gerenciar Categorias/Tags",
    "articles.comment_moderate": "Moderar Comentários",
    # CMS/Páginas
    "pages.page_view": "Visualizar Páginas",
    "pages.page_create": "Criar Páginas",
    "pages.page_edit": "Editar Páginas",
    "pages.page_delete": "Excluir Páginas",
    # Mídia
    "media.media_view": "Ver Biblioteca de Mídia",
    "media.media_upload": "Fazer Upload de Mídia",
    "media.media_delete": "Excluir Mídia",
    # Messenger
    "messenger.view": "Acesso ao Chat",
    "messenger.admin": "Administrar Grupos/Conversas",
    # CRM
    "crm.deal_view": "Visualizar CRM (cards)",
    "crm.deal_edit": "Editar cards do CRM",
    "crm.deal_delete": "Excluir cards do CRM",
    "crm.deal_comment": "Publicar updates no CRM",
    "crm.deal_attach": "Anexar imagens/arquivos no CRM",
    "crm.deal_attach_delete": "Remover anexos no CRM",
    "crm.saved_view_manage": "Gerenciar vistas salvas do CRM",
    "crm.pipeline_manage": "Gerenciar pipelines do CRM",
    "crm.column_manage": "Gerenciar colunas do CRM",
    "crm.contact_manage": "Gerenciar contatos do CRM",
    # Calendário
    "calendar.event_view": "Visualizar Calendário",
    "calendar.event_manage": "Criar/Editar eventos do Calendário",
    # Financeiro / Folha
    "finance.view_financial": "Visualizar Financeiro",
    "finance.manage_financial": "Gerenciar Financeiro",
    # Administração
    "admin.user_manage": "Gerenciar Equipe/Convites",
    "admin.smtp_manage": "Configurações de E-mail",
    "admin.view_dashboard": "Acessar Painel Administrativo",
    "admin.settings_manage": "Configurações da Empresa",
    # Configurações (Admin)
    "settings.api_keys_manage": "Gerenciar Chaves de API",
    "settings.webhooks_manage": "Gerenciar Webhooks",
}

DEFAULT_ROLES = {
    "Administrador": {
        "description": "Acesso total a todos os recursos da empresa.",
        "permissions": list(AVAILABLE_PERMISSIONS.keys()),
    },
    "Editor": {
        "description": "Pode criar e gerenciar conteúdo, mas sem acesso a configurações administrativas.",
        "permissions": [
            "articles.article_view",
            "articles.article_create",
            "articles.article_edit",
            "articles.article_publish",
            "articles.category_manage",
            "articles.comment_moderate",
            "pages.page_view",
            "pages.page_create",
            "pages.page_edit",
            "media.media_view",
            "media.media_upload",
            "messenger.view",
            "finance.view_financial",
            "crm.deal_view",
            "crm.deal_edit",
            "crm.deal_comment",
            "crm.deal_attach",
            "crm.deal_attach_delete",
            "crm.saved_view_manage",
            "calendar.event_view",
            "calendar.event_manage",
            "admin.view_dashboard",
        ],
    },
    "Membro": {
        "description": "Acesso de visualização e uso do chat.",
        "permissions": [
            "articles.article_view",
            "pages.page_view",
            "media.media_view",
            "messenger.view",
            "finance.view_financial",
            "crm.deal_view",
            "crm.deal_comment",
            "calendar.event_view",
        ],
    },
    "Colaborador": {
        "description": "Acesso básico para colaboradores (inclui Financeiro pessoal).",
        "permissions": [
            "articles.article_view",
            "pages.page_view",
            "media.media_view",
            "messenger.view",
            "finance.view_financial",
            "crm.deal_view",
            "crm.deal_edit",
            "crm.deal_comment",
            "crm.deal_attach",
            "crm.deal_attach_delete",
            "calendar.event_view",
        ],
    },
}


class HasRolePermission(permissions.BasePermission):
    """
    Verifica se o usuário tem a permissão exigida pela view (definida em 'required_permission').
    As permissões são checadas através do Role do usuário.
    """

    def has_permission(self, request, view):
        # Admin/Superuser sempre pode
        if request.user.is_superuser:
            return True

        required_permission = getattr(view, "required_permission", None)
        if not required_permission:
            return True  # Se a view não exige permissão específica, passa

        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        if not isinstance(perms, list):
            role_id = getattr(request.user, "role_id", None)
            if not role_id:
                return False
            from .models import Role

            company = getattr(request, "company", None) or getattr(request.user, "company", None)
            try:
                role = Role.all_objects.only("permissions", "company_id").get(id=role_id)
            except Role.DoesNotExist:
                return False
            if company and getattr(role, "company_id", None) != company.id:
                return False
            perms = role.permissions
        if not isinstance(perms, list):
            return False
        if isinstance(perms, list) and "*" in perms:
            return True

        # Verifica se o slug da permissão está na lista de permissões da role
        return required_permission in perms


class ActionRolePermission(permissions.BasePermission):
    """
    Permission class que suporta permissões diferenciadas por action DRF.

    Ao invés de mutar `self.required_permission` dentro de `perform_create` /
    `perform_update` / `perform_destroy` (antipadrão — mutação de estado compartilhado
    que é frágil em servidores concorrentes), esta classe lê o mapa `action_permissions`
    declarado na view:

        class ArticleViewSet(ModelViewSet):
            permission_classes = [IsAuthenticated, HasModuleAccess, ActionRolePermission]
            action_permissions = {
                'list':           'articles.article_view',
                'retrieve':       'articles.article_view',
                'create':         'articles.article_create',
                'update':         'articles.article_edit',
                'partial_update': 'articles.article_edit',
                'destroy':        'articles.article_delete',
                # Custom actions:
                'publish':        'articles.article_publish',
                'submit_for_review': 'articles.article_create',
            }

    Se a action não estiver no mapa, cai no `required_permission` padrão da view.
    Se nenhum dos dois estiver definido, acesso liberado para qualquer autenticado.
    """

    def has_permission(self, request, view):
        if request.user.is_superuser:
            return True

        # Resolve a permissão: action-specific > required_permission padrão
        action = getattr(view, "action", None)
        action_permissions = getattr(view, "action_permissions", {})
        required = action_permissions.get(action) or getattr(view, "required_permission", None)

        if not required:
            return True

        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        if not isinstance(perms, list):
            role_id = getattr(request.user, "role_id", None)
            if not role_id:
                return False
            from .models import Role

            company = getattr(request, "company", None) or getattr(request.user, "company", None)
            try:
                role = Role.all_objects.only("permissions", "company_id").get(id=role_id)
            except Role.DoesNotExist:
                return False
            if company and getattr(role, "company_id", None) != company.id:
                return False
            perms = role.permissions
        if not isinstance(perms, list):
            return False
        if isinstance(perms, list) and "*" in perms:
            return True

        return required in perms


class AnyRolePermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.user.is_superuser:
            return True

        action = getattr(view, "action", None)
        action_any_permissions = getattr(view, "action_any_permissions", {})
        required_list = action_any_permissions.get(action) or getattr(view, "any_permissions", None)

        if not required_list:
            return True

        role = getattr(request.user, "role", None)
        perms = getattr(role, "permissions", None)
        if not isinstance(perms, list):
            role_id = getattr(request.user, "role_id", None)
            if not role_id:
                return False
            from .models import Role

            company = getattr(request, "company", None) or getattr(request.user, "company", None)
            try:
                role = Role.all_objects.only("permissions", "company_id").get(id=role_id)
            except Role.DoesNotExist:
                return False
            if company and getattr(role, "company_id", None) != company.id:
                return False
            perms = role.permissions
        if not isinstance(perms, list):
            return False

        if "*" in perms:
            return True

        return any(p in perms for p in required_list)


class FeatureLimitPermission(permissions.BasePermission):
    """
    A1: Centralises feature-limit (licensing) checks in a DRF permission class.

    Previously, views called check_feature_limit() inside perform_create() and raised
    ValidationError — semantically wrong (400 vs 403) and leaks business logic into
    the serializer lifecycle.

    Usage:
        class UserViewSet(ModelViewSet):
            permission_classes = [IsAuthenticated, FeatureLimitPermission]
            feature_limit_code = 'max_users'

    The permission is evaluated only on write actions (create).
    Read actions (list, retrieve) always pass.
    Superusers always bypass the limit.
    Raises HTTP 403 with a descriptive message when limit is reached.
    """

    # Actions that trigger the license check
    _write_actions = frozenset(["create"])

    def has_permission(self, request, view):
        action = getattr(view, "action", None)
        if action not in self._write_actions:
            return True  # No-op for reads

        if request.user.is_superuser:
            return True  # Superusers bypass license limits

        feature_code = getattr(view, "feature_limit_code", None)
        if not feature_code:
            return True  # No limit configured on this view

        company = getattr(request, "company", None)
        if not company:
            logger.warning("FeatureLimitPermission: no company context for action '%s'", action)
            return True  # Cannot check without company — do not block

        try:
            from shared_kernel.licensing import check_feature_limit

            can_add, limit, current = check_feature_limit(company, feature_code)
        except Exception:
            logger.exception("FeatureLimitPermission: error in check_feature_limit for '%s'", feature_code)
            return True  # Fail open for licensing errors

        if not can_add:
            limit_display = "ilimitado" if limit == -1 else str(limit)
            self.message = (
                f"Limite de {feature_code.replace('max_', '')} atingido "
                f"({current}/{limit_display}). Faça um upgrade do seu plano."
            )
            logger.info(
                "FeatureLimitPermission: limit reached for '%s' on '%s' (%d/%s)",
                feature_code,
                company.slug,
                current,
                limit_display,
            )
            return False

        return True
