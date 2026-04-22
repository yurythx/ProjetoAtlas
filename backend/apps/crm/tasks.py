import logging
from celery import shared_task
from django.utils import timezone
from .models import Deal, DealActivity

logger = logging.getLogger(__name__)

@shared_task
def analyze_deal_ai_metadata(deal_id):
    """
    Background task to analyze deal health, risk and sentiment, 
    populating the ai_metadata field.
    """
    try:
        deal = Deal.all_objects.get(id=deal_id)
    except Deal.DoesNotExist:
        return

    metadata = deal.ai_metadata or {}
    
    # 1. Calculate Risk Score (0-100)
    risk_score = 0
    risk_factors = []
    
    # SLA Factor
    if deal.sla_status == 'breached':
        risk_score += 40
        risk_factors.append("SLA já rompido.")
    elif deal.sla_status == 'at_risk':
        risk_score += 25
        risk_factors.append("SLA em risco iminente.")
    
    # Residence Time Factor
    # If deal is in the current column for more than 3 days
    activities = DealActivity.objects.filter(deal=deal, activity_type__in=['column_change', 'stage_change']).order_by('-created_at')
    last_change = activities.first()
    entry_time = last_change.created_at if last_change else deal.created_at
    days_in_col = (timezone.now() - entry_time).total_seconds() / 86400
    
    if days_in_col > 5:
        risk_score += 30
        risk_factors.append(f"Estagnação: {int(days_in_col)} dias na mesma coluna.")
    elif days_in_col > 2:
        risk_score += 15
        risk_factors.append(f"Atenção: {int(days_in_col)} dias sem movimentação.")

    # Swarming Factor (Positive)
    swarm = getattr(deal, 'swarm', None)
    if swarm and swarm.is_active:
        risk_score = max(0, risk_score - 10)
        risk_factors.append("Ação mitigatória em curso (War Room ativa).")

    # 2. Sentiment/Urgency Analysis (Mock AI logic for now)
    # In a real scenario, this would call an LLM
    urgency_signals = ['urgente', 'parado', 'crítico', 'emergência', 'fogo', 'blocker']
    desc_lower = (deal.description or "").lower()
    has_urgency = any(sig in desc_lower for sig in urgency_signals)
    
    if has_urgency:
        risk_score += 20
        risk_factors.append("Sinais de urgência detectados no texto.")

    # 3. Update Metadata
    next_best_action = "Atualizar status"
    if risk_score > 60:
        swarm = getattr(deal, 'swarm', None)
        if not swarm or not swarm.is_active:
            next_best_action = "Iniciar Swarming"

    metadata.update({
        "last_ai_analysis": timezone.now().isoformat(),
        "risk_score": min(100, risk_score),
        "risk_factors": risk_factors,
        "sentiment": "negative" if risk_score > 50 else "neutral" if risk_score > 20 else "positive",
        "next_best_action": next_best_action
    })

    deal.ai_metadata = metadata
    deal.save(update_fields=['ai_metadata'])
    
    logger.info(f"AI Analysis completed for Deal #{deal_id}. Score: {risk_score}")

@shared_task
def capture_crm_metrics_snapshot():
    """
    Periodic task to capture a daily snapshot of all pipelines metrics.
    """
    from .models import Pipeline, MetricSnapshot, Deal, XLAFeedback
    from django.db.models import Avg
    
    pipelines = Pipeline.all_objects.all()
    for pipeline in pipelines:
        # Calculate Throughput (Deals closed in last 7 days)
        last_week = timezone.now() - timezone.timedelta(days=7)
        throughput = Deal.all_objects.filter(
            column__pipeline=pipeline, 
            is_closed=True, 
            updated_at__gte=last_week
        ).count()
        
        # Calculate Lead Time (Avg of deals closed in last 30 days)
        last_month = timezone.now() - timezone.timedelta(days=30)
        closed_deals = Deal.all_objects.filter(
            column__pipeline=pipeline, 
            is_closed=True, 
            updated_at__gte=last_month
        )
        avg_lead_time = 0
        if closed_deals.exists():
            total_days = sum([(d.updated_at - d.created_at).total_seconds() / 86400 for d in closed_deals])
            avg_lead_time = total_days / closed_deals.count()
            
        # SLA Compliance
        active_deals = Deal.all_objects.filter(column__pipeline=pipeline, is_closed=False)
        sla_breached = active_deals.filter(sla_status='breached').count()
        compliance = 100
        if active_deals.exists():
            compliance = max(0, 100 - (sla_breached / active_deals.count() * 100))
            
        # XLA Score (1 to 10 scale)
        xla_avg = XLAFeedback.objects.filter(deal__column__pipeline=pipeline).aggregate(
            avg_ease=Avg('ease_of_use'),
            avg_speed=Avg('speed_satisfaction'),
            avg_outcome=Avg('outcome_satisfaction')
        )
        
        xla_score = 0
        if xla_avg['avg_ease']:
            # Average of components (each 1-5) * 2 = scale of 10
            xla_score = (xla_avg['avg_ease'] + xla_avg['avg_speed'] + xla_avg['avg_outcome']) / 3 * 2

        MetricSnapshot.all_objects.update_or_create(
            date=timezone.now().date(),
            pipeline=pipeline,
            company=pipeline.company,
            defaults={
                "avg_lead_time_days": round(avg_lead_time, 1),
                "throughput_weekly": throughput,
                "sla_compliance_rate": round(compliance, 1),
                "avg_xla_score": round(xla_score, 1),
                "active_deals_count": active_deals.count()
            }
        )
    
    logger.info("Daily CRM Metrics Snapshot completed.")

@shared_task
def run_periodic_crm_cleanup():
    """
    Task to run once a day to cleanup or aggregate metrics.
    """
    # Example: could close very old abandoned deals or archive activity
    pass
