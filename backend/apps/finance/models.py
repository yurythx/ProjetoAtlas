from django.conf import settings
from django.db import models

from apps.calendar.models import Event
from shared_kernel.models import BaseTenantModel


class Category(BaseTenantModel):
    """
    Categorias financeiras (ex: Vendas, Marketing, Infraestrutura).
    """

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=20, default="#000000")
    is_shared = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_finance_categories",
    )

    # Override company to avoid clash with articles.Category
    company = models.ForeignKey(
        "core.Company", on_delete=models.CASCADE, related_name="finance_categories", db_index=True
    )

    class Meta:
        verbose_name = "Financial Category"
        verbose_name_plural = "Financial Categories"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"],
                condition=models.Q(is_shared=True),
                name="finance_category_unique_shared_name_per_company",
            ),
            models.UniqueConstraint(
                fields=["company", "created_by", "name"],
                condition=models.Q(is_shared=False),
                name="finance_category_unique_personal_name_per_user",
            ),
        ]

    def __str__(self):
        return self.name


class Transaction(BaseTenantModel):
    """
    Representa uma transação financeira (Receita ou Despesa).
    """

    TYPE_CHOICES = (
        ("in", "Receita"),
        ("out", "Despesa"),
    )

    STATUS_CHOICES = (
        ("pending", "Pendente"),
        ("paid", "Pago"),
        ("overdue", "Atrasado"),
        ("cancelled", "Cancelado"),
    )

    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2, help_text="Valor da transação")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions"
    )

    due_date = models.DateField(help_text="Data de vencimento")
    payment_date = models.DateField(null=True, blank=True, help_text="Data do pagamento efetivo")
    competence_date = models.DateField(help_text="Data de competência (mês de referência)")

    # Integração opcional com Calendar
    linked_event = models.ForeignKey(
        Event, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions"
    )

    # Recorrência
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.CharField(
        max_length=255, 
        blank=True, 
        null=True, 
        help_text="Regra de recorrência (ex: FREQ=MONTHLY;INTERVAL=1)"
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_transactions"
    )

    class Meta:
        verbose_name = "Transaction"
        verbose_name_plural = "Transactions"
        indexes = [
            models.Index(fields=["company", "competence_date"]),
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "type"]),
        ]

    def __str__(self):
        return f"{self.get_type_display()}: {self.description} ({self.amount})"


class MonthClosing(BaseTenantModel):
    """
    Representa o fechamento financeiro de um mês específico.
    Quando um mês está fechado, transações daquela competência não podem ser criadas, editadas ou excluídas.
    """
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()
    closed_at = models.DateTimeField(auto_now_add=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        verbose_name = "Month Closing"
        verbose_name_plural = "Month Closings"
        unique_together = ("company", "month", "year")
        ordering = ["-year", "-month"]

    def __str__(self):
        return f"{self.month:02d}/{self.year} - {self.company.name}"


class TransactionAttachment(BaseTenantModel):
    """
    Anexos (comprovantes, NFs) vinculados a uma transação financeira.
    """
    from shared_kernel.utils import tenant_upload_to
    transaction = models.ForeignKey(Transaction, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=tenant_upload_to)
    description = models.CharField(max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        verbose_name = "Transaction Attachment"
        verbose_name_plural = "Transaction Attachments"

    def __str__(self):
        return f"Attachment for {self.transaction.description}"
