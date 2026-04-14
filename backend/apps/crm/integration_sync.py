from decimal import Decimal

from django.contrib.auth import get_user_model

from .models import Column, Contact, Deal

User = get_user_model()


def _is_done_column(column=None):
    return bool(column and column.is_done())


def _get_default_contact(company, integration_source):
    contact, _ = Contact.all_objects.get_or_create(
        company=company,
        name=f"Integração {integration_source.upper()}",
        defaults={"email": None, "phone": None},
    )
    return contact


def _get_default_owner(company):
    return User.all_objects.filter(company=company).order_by("id").first()


def upsert_integration_card(
    *,
    company,
    pipeline,
    column=None,
    external_id,
    title,
    description=None,
    integration_source="glpi",
    value=None,
    priority="MEDIUM",
    closing_date=None,
    data_agendamento=None,
    tecnico_responsavel=None,
    owner=None,
    contact=None,
    custom_fields=None,
):
    target_column = column or Column.all_objects.filter(company=company, pipeline=pipeline).order_by("order", "id").first()
    if target_column is None:
        raise ValueError("pipeline_has_no_columns")

    card = Deal.all_objects.filter(company=company, external_id=external_id).first()
    resolved_owner = owner or _get_default_owner(company)
    if resolved_owner is None:
        raise ValueError("no_owner_available")

    payload = {
        "title": title,
        "description": description,
        "integration_source": integration_source or "glpi",
        "external_id": external_id,
        "value": value if value is not None else Decimal("0.00"),
        "priority": priority or "MEDIUM",
        "closing_date": closing_date,
        "data_agendamento": data_agendamento,
        "tecnico_responsavel": tecnico_responsavel,
        "custom_fields": custom_fields or {},
    }

    if card is not None:
        for key, field_value in payload.items():
            setattr(card, key, field_value)
        if column is not None:
            card.column = column
            card.stage = column.legacy_stage
        if tecnico_responsavel is not None:
            card.tecnico_responsavel = tecnico_responsavel
        card.is_closed = _is_done_column(card.column) if card.column_id else card.is_closed
        card.save()
        return card, False

    resolved_contact = contact or _get_default_contact(company, payload["integration_source"])
    card = Deal.all_objects.create(
        company=company,
        owner=resolved_owner,
        contact=resolved_contact,
        stage=target_column.legacy_stage,
        column=target_column,
        title=payload["title"],
        description=payload["description"],
        integration_source=payload["integration_source"],
        external_id=payload["external_id"],
        value=payload["value"],
        priority=payload["priority"],
        closing_date=payload["closing_date"],
        data_agendamento=payload["data_agendamento"],
        tecnico_responsavel=payload["tecnico_responsavel"],
        custom_fields=payload["custom_fields"],
        is_closed=_is_done_column(target_column),
    )
    return card, True

