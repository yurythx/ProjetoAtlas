from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone
from datetime import datetime, time
from apps.finance.models import Transaction
from apps.calendar.models import Event

@receiver(post_save, sender=Transaction)
def sync_transaction_to_calendar(sender, instance, created, **kwargs):
    """
    Sincroniza uma transação com o calendário criando/atualizando um Event.
    """
    if not instance.created_by:
        return

    title = f"{'💰 Receita' if instance.type == 'in' else '💸 Despesa'}: {instance.description}"
    color = "emerald" if instance.type == "in" else "rose"
    
    # Combine due_date with a default time (e.g. 09:00 AM)
    start_dt = timezone.make_aware(datetime.combine(instance.due_date, time(9, 0)))
    end_dt = timezone.make_aware(datetime.combine(instance.due_date, time(10, 0)))

    if instance.linked_event:
        event = instance.linked_event
        event.title = title
        event.description = f"Transação financeira no valor de R$ {instance.amount}.\nStatus: {instance.get_status_display()}"
        event.start_datetime = start_dt
        event.end_datetime = end_dt
        event.color_category = color
        event.rrule = instance.recurrence_rule if instance.is_recurring else None
        event.save()
    else:
        event = Event.objects.create(
            company=instance.company,
            owner=instance.created_by,
            title=title,
            description=f"Transação financeira no valor de R$ {instance.amount}.\nStatus: {instance.get_status_display()}",
            start_datetime=start_dt,
            end_datetime=end_dt,
            is_all_day=True,
            color_category=color,
            rrule=instance.recurrence_rule if instance.is_recurring else None
        )
        # Use update to avoid recursion if we had a signal on Transaction for linked_event
        Transaction.objects.filter(pk=instance.pk).update(linked_event=event)

@receiver(post_delete, sender=Transaction)
def delete_transaction_event(sender, instance, **kwargs):
    """
    Remove o evento do calendário quando a transação é deletada.
    """
    if instance.linked_event:
        instance.linked_event.delete()
