from django.db import transaction
from django.utils import timezone

from apps.calendar.models import Event
from apps.module_manager.models import TenantModule
from apps.notifications.models import Notification
from apps.notifications.tasks import notify_user_push

from .models import get_column_semantic_defaults


def create_default_stages(sender, instance, created, **kwargs):
    """Cria os estágios padrão [Novo, Planejados, Em Andamento, Concluído] para novos Pipelines."""
    if created:
        from .models import Stage

        default_stages = [
            ("Novo", 10),
            ("Planejados", 20),
            ("Em Andamento", 30),
            ("Concluído", 40),
        ]
        for name, order in default_stages:
            Stage.objects.create(pipeline=instance, name=name, order=order, company=instance.company)


def ensure_column_for_stage(sender, instance, created, **kwargs):
    """Mantém uma coluna espelhada para cada legacy stage."""
    from .models import Column

    defaults = {
        "pipeline": instance.pipeline,
        "title": instance.name,
        "order": instance.order,
        "company": instance.company,
        **get_column_semantic_defaults(title=instance.name),
    }

    if created:
        Column.objects.create(legacy_stage=instance, **defaults)
        return

    if hasattr(instance, "column") and instance.column_id:
        Column.all_objects.filter(id=instance.column.id).update(**defaults)
    else:
        Column.objects.create(legacy_stage=instance, **defaults)


@transaction.atomic
def sync_deal_with_calendar(sender, instance, created, **kwargs):
    """Sincroniza automaticamente o Deal do CRM com o Calendário e envia notificações."""

    if instance.column_id is None and instance.stage_id:
        legacy_stage_column = getattr(instance.stage, "column", None)
        if legacy_stage_column is not None:
            instance.__class__.all_objects.filter(id=instance.id).update(column=legacy_stage_column)
            instance.column = legacy_stage_column

    # 1. Sincronização com Calendário (tenant-first: só cria evento se módulo Calendar estiver ativo)
    if not getattr(instance, "company_id", None):
        calendar_enabled = False
    else:
        calendar_enabled = TenantModule.all_objects.filter(
            company_id=instance.company_id,
            module__code="calendar",
            is_active=True,
        ).exists()

    primary_dt = instance.data_agendamento or instance.closing_date

    if not calendar_enabled:
        primary_dt = None

    try:
        if not primary_dt:
            if instance.linked_event_id:
                Event.all_objects.filter(id=instance.linked_event_id).delete()
                instance.__class__.all_objects.filter(id=instance.id).update(linked_event_id=None)
        else:
            color_map = {"LOW": "green", "MEDIUM": "blue", "HIGH": "orange", "URGENT": "red"}

            start_dt = primary_dt
            if timezone.is_naive(start_dt):
                start_dt = timezone.make_aware(start_dt)

            end_dt = start_dt + timezone.timedelta(hours=1)

            owner = instance.tecnico_responsavel_id or instance.owner_id

            event_data = {
                "title": f"[{instance.priority}] {instance.title}",
                "description": (
                    f"CRM: {instance.description or ''}\n"
                    f"Cliente: {instance.contact.name if instance.contact_id else 'Sem contato'}\n"
                    f"Agendamento: {instance.data_agendamento.isoformat() if instance.data_agendamento else '-'}\n"
                    f"Prazo (SLA): {instance.closing_date.isoformat() if instance.closing_date else '-'}\n"
                    f"Link: /crm?dealId={instance.id}"
                ),
                "start_datetime": start_dt,
                "end_datetime": end_dt,
                "color_category": color_map.get(instance.priority, "blue"),
                "company": instance.company,
                "owner_id": owner,
            }

            if instance.linked_event_id:
                updated = Event.all_objects.filter(id=instance.linked_event_id, company=instance.company).update(**event_data)
                if updated == 0:
                    event = Event.all_objects.create(**event_data)
                    instance.__class__.all_objects.filter(id=instance.id).update(linked_event_id=event.id)
            else:
                event = Event.all_objects.create(**event_data)
                instance.__class__.all_objects.filter(id=instance.id).update(linked_event_id=event.id)
    except Exception:
        import logging

        logging.getLogger(__name__).exception(
            "crm_calendar_sync_failed",
            extra={
                "company_id": getattr(instance, "company_id", None),
                "deal_id": getattr(instance, "id", None),
                "linked_event_id": getattr(instance, "linked_event_id", None),
            },
        )

    # 2. Sistema de notificações e histórico
    from .models import DealActivity

    if created:
        current_column = (getattr(instance.stage, "column", None) if instance.stage_id else None) or instance.column
        column_name = current_column.title if current_column else (instance.stage.name if instance.stage_id else "sem coluna")
        DealActivity.objects.create(
            company=instance.company,
            deal=instance,
            actor=instance.owner,
            description=f"Card criado na coluna '{column_name}'.",
            new_value={"column": column_name}
        )
        Notification.objects.create(
            recipient=instance.owner,
            company=instance.company,
            title="Novo Card Criado",
            message=f"O card '{instance.title}' foi adicionado à coluna '{column_name}'.",
            notification_type=Notification.TYPE_SYSTEM,
            metadata={"deal_uuid": str(instance.uuid)},
        )
    elif set(["stage", "column", "column_id"]) & set(kwargs.get("update_fields") or []):
        current_column = (getattr(instance.stage, "column", None) if instance.stage_id else None) or instance.column
        column_name = current_column.title if current_column else (instance.stage.name if instance.stage_id else "sem coluna")
        DealActivity.objects.create(
            company=instance.company,
            deal=instance,
            actor=instance.owner,
            description=f"Card movido para a coluna '{column_name}'.",
            new_value={"column": column_name}
        )
        Notification.objects.create(
            recipient=instance.owner,
            company=instance.company,
            title="Card Movimentado",
            message=f"O card '{instance.title}' foi movido para a coluna '{column_name}'.",
            notification_type=Notification.TYPE_SYSTEM,
            metadata={"deal_uuid": str(instance.uuid)},
        )


def delete_calendar_event(sender, instance, **kwargs):
    """Remove o evento da agenda ao deletar o card do CRM."""
    if instance.linked_event_id:
        from apps.calendar.models import Event

        Event.all_objects.filter(id=instance.linked_event_id).delete()


def trigger_xla_survey(sender, instance, created, **kwargs):
    """Gatilha pesquisa XLA via WhatsApp quando um Deal é fechado."""
    if created:
        return
    
    update_fields = kwargs.get("update_fields")
    # Se update_fields foi informado e não inclui is_closed, skip
    if update_fields is not None and "is_closed" not in update_fields:
        return
    
    # Verifica se o card foi marcado como fechado agora
    if instance.is_closed:
        from .models import EvolutionConfig
        from .integrations import EvolutionClient
        
        # Busca config ativa para a empresa
        config = EvolutionConfig.objects.filter(company=instance.company, is_active=True).first()
        
        if config and instance.contact and instance.contact.phone:
            client = EvolutionClient(config)
            
            message_text = (
                f"Olá {instance.contact.name}! 🌟\n\n"
                f"Sua solicitação '{instance.title}' foi concluída.\n"
                "Para nos ajudar a melhorar o fluxo de valor, como você avalia sua experiência?"
            )
            
            # Envia a mensagem de texto inicial
            client.send_text(instance.contact.phone, message_text)
            
            # Envia a enquete de XLA (1 a 10) para alinhar com o modelo Atlas Premium
            client.send_poll(
                number=instance.contact.phone,
                name="Avaliação de Experiência (XLA)",
                options=["1", "2", "3", "4", "5", "6", "7", "8", "9", "10 - Excelente"]
            )

def check_wip_and_sla_risks(sender, instance, created, **kwargs):
    """
    Analisa riscos de governança em tempo real (WIP e SLA) e notifica via Push.
    Só executa quando campos relevantes (column, closing_date, is_closed) mudam.
    """
    from .models import Deal, Column
    
    update_fields = kwargs.get("update_fields")
    
    # Se update_fields foi especificado, verificar se campos relevantes mudaram
    relevant_fields = {"column", "closing_date", "is_closed", "column_id"}
    if update_fields is not None and not (relevant_fields & set(update_fields)):
        return
    
    # 1. Verificação de Limite de WIP
    if instance.column_id:
        column = instance.column
        if column and column.wip_limit:
            current_cards_count = Deal.objects.filter(column=column, is_closed=False, is_deleted=False).count()
            
            if current_cards_count >= column.wip_limit:
                # Notificar o dono do card e o técnico responsável
                recipients = set()
                if instance.owner: recipients.add(instance.owner)
                if instance.tecnico_responsavel: recipients.add(instance.tecnico_responsavel)
                
                msg = f"Governança Atlas: A coluna '{column.title}' atingiu o limite de WIP ({column.wip_limit}). O card '{instance.title}' entrou na zona de monitoramento intensivo (ITIL Version 5)."
                
                for user in recipients:
                    Notification.objects.create(
                        recipient=user,
                        company=instance.company,
                        title="⚠️ Limite de WIP Atingido",
                        message=msg,
                        notification_type=Notification.TYPE_SYSTEM,
                    )
                    notify_user_push(user, "⚠️ Limite de WIP", msg, f"/crm?dealId={instance.id}")

    # 2. IA Early Warning: Risco de Quebra de SLA Iminente
    if not instance.is_closed and instance.closing_date:
        now = timezone.now()
        time_to_sla = instance.closing_date - now
        
        # Heurística de risco: menos de 4 horas para o prazo ou menos de 20% do tempo total restando
        # Aqui simulamos a 'detecção AI'
        is_at_high_risk = False
        reason = ""
        
        if time_to_sla.total_seconds() < 14400 and time_to_sla.total_seconds() > 0: # 4 horas
            is_at_high_risk = True
            reason = "Menos de 4 horas para expiração do SLA."
        
        if is_at_high_risk:
            msg = f"AI Early Warning: O card '{instance.title}' tem alta probabilidade de quebra de SLA. {reason} (Governança de Fluxo ITIL Version 5)."
            
            # Notificar para ação imediata
            recipients = set()
            if instance.owner: recipients.add(instance.owner)
            if instance.tecnico_responsavel: recipients.add(instance.tecnico_responsavel)
            
            for user in recipients:
                Notification.objects.create(
                    recipient=user,
                    company=instance.company,
                    title="🚨 Risco de SLA Iminente",
                    message=msg,
                    notification_type=Notification.TYPE_SYSTEM,
                    metadata={"risk_level": "high"}
                )
                notify_user_push(user, "🚨 Risco de SLA", msg, f"/crm?dealId={instance.id}")

def create_rfc_from_problem(sender, instance, created, **kwargs):
    """
    ITIL Version 5: Ao definir uma Causa Raiz em um Problema, 
    gera automaticamente uma Requisição de Mudança (RFC) como rascunho.
    """
    if created:
        return
        
    update_fields = kwargs.get("update_fields")
    # Se root_cause não está no update_fields, ignoramos
    if update_fields is not None and "root_cause" not in update_fields:
        return
        
    if instance.record_type == "problem" and instance.root_cause:
        from .models import Deal
        
        # Evita criar múltiplas RFCs para o mesmo problema
        if instance.ai_metadata.get("linked_rfc_id"):
            return
            
        # Cria a Mudança (Change)
        rfc = Deal.objects.create(
            company=instance.company,
            owner=instance.owner,
            contact=instance.contact,
            stage=instance.stage,
            column=instance.column,
            title=f"RFC: Resolução de {instance.title}",
            record_type="change",
            change_justification=f"Derivado do Problema: {instance.title}\nCausa Raiz: {instance.root_cause}",
            description=f"Mudança estrutural requerida para sanar permanentemente o problema '{instance.title}'.",
            priority=instance.priority,
        )
        
        # Vincula o ID da RFC ao problema para evitar duplicidade
        # Usamos uma transação ou save direto aqui. Como estamos num signal post_save de Deal,
        # precisamos ter cuidado com recursão infinita. O update_fields nos salva.
        instance.ai_metadata["linked_rfc_id"] = rfc.id
        instance.__class__.objects.filter(id=instance.id).update(ai_metadata=instance.ai_metadata)
        
        # Notifica o dono
        from apps.notifications.models import Notification
        Notification.objects.create(
            recipient=instance.owner,
            company=instance.company,
            title="🛠️ RFC Gerada Automaticamente",
            message=f"Uma Requisição de Mudança foi gerada para tratar a causa raiz do problema '{instance.title}'.",
            notification_type=Notification.TYPE_SYSTEM,
            metadata={"deal_uuid": str(rfc.uuid)},
        )

def trigger_ai_analysis(sender, instance, created, **kwargs):
    """
    ITIL Version 5: Dispara a análise de IA em background para atualizar 
    o score de risco e metadados de governança.
    """
    from apps.ai.tasks import analyze_deal_ai_metadata
    
    # Executa a tarefa de forma assíncrona (Celery)
    transaction.on_commit(lambda: analyze_deal_ai_metadata.delay(instance.id))
