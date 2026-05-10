import csv
import io
import logging
from datetime import datetime

from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger(__name__)


def _store_report(task_id: str, content: bytes, filename: str, content_type: str):
    """Store a finished report in Redis for 30 minutes."""
    cache.set(
        f"report:{task_id}",
        {"content": content, "filename": filename, "content_type": content_type, "status": "done"},
        timeout=1800,
    )


def _mark_error(task_id: str, detail: str):
    cache.set(f"report:{task_id}", {"status": "error", "detail": detail}, timeout=300)


@shared_task(bind=True, soft_time_limit=180, time_limit=240)
def generate_crm_report(self, company_id: int, fmt: str, filters: dict):
    """Generate CRM deals report as CSV or PDF."""
    from django.apps import apps

    task_id = self.request.id
    cache.set(f"report:{task_id}", {"status": "processing"}, timeout=300)

    try:
        Deal = apps.get_model("crm", "Deal")
        qs = Deal.objects.filter(company_id=company_id).select_related("column", "contact", "assigned_to")

        if filters.get("record_type"):
            qs = qs.filter(record_type=filters["record_type"])
        if filters.get("is_closed") is not None:
            qs = qs.filter(is_closed=filters["is_closed"])
        if filters.get("priority"):
            qs = qs.filter(priority=filters["priority"])

        filename = f"crm_deals_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if fmt == "csv":
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["ID", "Título", "Tipo", "Prioridade", "Status SLA", "Responsável", "Coluna", "Criado em", "Fechado"])
            for d in qs.iterator(chunk_size=200):
                writer.writerow([
                    d.id,
                    d.title,
                    d.record_type,
                    d.priority,
                    d.sla_status or "",
                    d.assigned_to.get_full_name() if d.assigned_to else "",
                    d.column.title if d.column else "",
                    d.created_at.strftime("%Y-%m-%d %H:%M"),
                    "Sim" if d.is_closed else "Não",
                ])
            _store_report(task_id, buf.getvalue().encode("utf-8-sig"), f"{filename}.csv", "text/csv")

        elif fmt == "pdf":
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title="Relatório CRM")
            styles = getSampleStyleSheet()
            elements = [Paragraph("Relatório de Deals — CRM", styles["Title"])]

            data = [["ID", "Título", "Tipo", "Prioridade", "SLA", "Responsável", "Fechado"]]
            for d in qs.iterator(chunk_size=200):
                data.append([
                    str(d.id)[:8],
                    d.title[:50],
                    d.record_type,
                    d.priority,
                    d.sla_status or "-",
                    d.assigned_to.get_full_name()[:20] if d.assigned_to else "-",
                    "Sim" if d.is_closed else "Não",
                ])

            table = Table(data, repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4f46e5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(table)
            doc.build(elements)
            _store_report(task_id, buf.getvalue(), f"{filename}.pdf", "application/pdf")

        else:
            _mark_error(task_id, f"Unsupported format: {fmt}")

    except Exception as exc:
        logger.exception("Error generating CRM report task_id=%s", task_id)
        _mark_error(task_id, str(exc))
        raise


@shared_task(bind=True, soft_time_limit=180, time_limit=240)
def generate_articles_report(self, company_id: int, fmt: str, filters: dict):
    """Generate knowledge-base articles report as CSV or PDF."""
    from django.apps import apps

    task_id = self.request.id
    cache.set(f"report:{task_id}", {"status": "processing"}, timeout=300)

    try:
        Article = apps.get_model("articles", "Article")
        qs = Article.objects.filter(company_id=company_id).select_related("author", "category")

        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        if filters.get("is_public") is not None:
            qs = qs.filter(is_public=filters["is_public"])
        if filters.get("category"):
            qs = qs.filter(category__slug=filters["category"])

        filename = f"articles_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if fmt == "csv":
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["ID", "Título", "Autor", "Categoria", "Status", "Público", "Publicado em", "Atualizado em"])
            for a in qs.iterator(chunk_size=200):
                writer.writerow([
                    a.id,
                    a.title,
                    a.author.get_full_name() if a.author else "",
                    a.category.name if a.category else "",
                    a.get_status_display(),
                    "Sim" if a.is_public else "Não",
                    a.published_at.strftime("%Y-%m-%d") if a.published_at else "",
                    a.updated_at.strftime("%Y-%m-%d %H:%M"),
                ])
            _store_report(task_id, buf.getvalue().encode("utf-8-sig"), f"{filename}.csv", "text/csv")

        elif fmt == "pdf":
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title="Relatório de Artigos")
            styles = getSampleStyleSheet()
            elements = [Paragraph("Base de Conhecimento — Artigos", styles["Title"])]

            data = [["ID", "Título", "Autor", "Categoria", "Status", "Público", "Publicado"]]
            for a in qs.iterator(chunk_size=200):
                data.append([
                    str(a.id)[:8],
                    a.title[:50],
                    a.author.get_full_name()[:20] if a.author else "-",
                    a.category.name[:20] if a.category else "-",
                    a.get_status_display(),
                    "Sim" if a.is_public else "Não",
                    a.published_at.strftime("%d/%m/%Y") if a.published_at else "-",
                ])

            table = Table(data, repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0891b2")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f9ff")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(table)
            doc.build(elements)
            _store_report(task_id, buf.getvalue(), f"{filename}.pdf", "application/pdf")

        else:
            _mark_error(task_id, f"Unsupported format: {fmt}")

    except Exception as exc:
        logger.exception("Error generating articles report task_id=%s", task_id)
        _mark_error(task_id, str(exc))
        raise


@shared_task(bind=True, soft_time_limit=180, time_limit=240)
def generate_finance_report(self, company_id: int, fmt: str, filters: dict):
    """Generate finance transactions report as CSV or PDF."""
    from django.apps import apps

    task_id = self.request.id
    cache.set(f"report:{task_id}", {"status": "processing"}, timeout=300)

    try:
        Transaction = apps.get_model("finance", "Transaction")
        qs = Transaction.objects.filter(company_id=company_id).select_related("category", "created_by")

        if filters.get("type"):
            qs = qs.filter(type=filters["type"])
        if filters.get("status"):
            qs = qs.filter(status=filters["status"])
        if filters.get("period"):
            try:
                year, month = filters["period"].split("-")
                qs = qs.filter(competence_date__year=int(year), competence_date__month=int(month))
            except (ValueError, AttributeError):
                pass
        if filters.get("start_date"):
            qs = qs.filter(due_date__gte=filters["start_date"])
        if filters.get("end_date"):
            qs = qs.filter(due_date__lte=filters["end_date"])

        filename = f"finance_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if fmt == "csv":
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["ID", "Descrição", "Tipo", "Status", "Valor", "Categoria", "Vencimento", "Pagamento", "Competência"])
            for t in qs.iterator(chunk_size=200):
                writer.writerow([
                    t.id,
                    t.description,
                    t.get_type_display(),
                    t.get_status_display(),
                    str(t.amount),
                    t.category.name if t.category else "",
                    t.due_date.strftime("%Y-%m-%d"),
                    t.payment_date.strftime("%Y-%m-%d") if t.payment_date else "",
                    t.competence_date.strftime("%Y-%m"),
                ])
            _store_report(task_id, buf.getvalue().encode("utf-8-sig"), f"{filename}.csv", "text/csv")

        elif fmt == "pdf":
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title="Relatório Financeiro")
            styles = getSampleStyleSheet()
            elements = [Paragraph("Relatório Financeiro", styles["Title"])]

            data = [["Descrição", "Tipo", "Status", "Valor (R$)", "Categoria", "Vencimento"]]
            for t in qs.iterator(chunk_size=200):
                data.append([
                    t.description[:40],
                    t.get_type_display(),
                    t.get_status_display(),
                    f"{t.amount:,.2f}",
                    t.category.name[:20] if t.category else "-",
                    t.due_date.strftime("%d/%m/%Y"),
                ])

            table = Table(data, repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#059669")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0fdf4")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(table)
            doc.build(elements)
            _store_report(task_id, buf.getvalue(), f"{filename}.pdf", "application/pdf")

        else:
            _mark_error(task_id, f"Unsupported format: {fmt}")

    except Exception as exc:
        logger.exception("Error generating finance report task_id=%s", task_id)
        _mark_error(task_id, str(exc))
        raise


@shared_task(bind=True, soft_time_limit=180, time_limit=240)
def generate_payroll_report(self, company_id: int, fmt: str, filters: dict):
    """Generate payroll lines report as CSV or PDF."""
    from django.apps import apps

    task_id = self.request.id
    cache.set(f"report:{task_id}", {"status": "processing"}, timeout=300)

    try:
        PayrollLine = apps.get_model("payroll", "PayrollLine")
        qs = (
            PayrollLine.objects.filter(company_id=company_id)
            .select_related("user", "payroll_run")
            .order_by("payroll_run__period_start", "user__last_name", "line_type")
        )

        if filters.get("status"):
            qs = qs.filter(payroll_run__status=filters["status"])
        if filters.get("period_start"):
            qs = qs.filter(payroll_run__period_start__gte=filters["period_start"])
        if filters.get("period_end"):
            qs = qs.filter(payroll_run__period_end__lte=filters["period_end"])

        filename = f"payroll_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        if fmt == "csv":
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["Funcionário", "Período Início", "Período Fim", "Status Folha", "Tipo", "Descrição", "Valor (R$)"])
            for line in qs.iterator(chunk_size=200):
                run = line.payroll_run
                writer.writerow([
                    line.user.get_full_name() or line.user.username,
                    run.period_start.strftime("%Y-%m-%d"),
                    run.period_end.strftime("%Y-%m-%d"),
                    run.status,
                    line.line_type,
                    line.label,
                    f"{line.amount:,.2f}",
                ])
            _store_report(task_id, buf.getvalue().encode("utf-8-sig"), f"{filename}.csv", "text/csv")

        elif fmt == "pdf":
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph

            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title="Relatório de Folha de Pagamento")
            styles = getSampleStyleSheet()
            elements = [Paragraph("Relatório de Folha de Pagamento", styles["Title"])]

            data = [["Funcionário", "Período", "Status", "Tipo", "Descrição", "Valor (R$)"]]
            for line in qs.iterator(chunk_size=200):
                run = line.payroll_run
                period = f"{run.period_start.strftime('%d/%m/%Y')} – {run.period_end.strftime('%d/%m/%Y')}"
                data.append([
                    (line.user.get_full_name() or line.user.username)[:30],
                    period,
                    run.status,
                    line.line_type,
                    line.label[:40],
                    f"{line.amount:,.2f}",
                ])

            table = Table(data, repeatRows=1)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#7c3aed")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#faf5ff")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("PADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(table)
            doc.build(elements)
            _store_report(task_id, buf.getvalue(), f"{filename}.pdf", "application/pdf")

        else:
            _mark_error(task_id, f"Unsupported format: {fmt}")

    except Exception as exc:
        logger.exception("Error generating payroll report task_id=%s", task_id)
        _mark_error(task_id, str(exc))
        raise
