from rest_framework import serializers

from .models import Category, MonthClosing, Transaction, TransactionAttachment


class MonthClosingSerializer(serializers.ModelSerializer):
    closed_by_name = serializers.CharField(source="closed_by.username", read_only=True)

    class Meta:
        model = MonthClosing
        fields = "__all__"
        read_only_fields = ["id", "company", "closed_at", "closed_by"]


class TransactionAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.username", read_only=True)

    class Meta:
        model = TransactionAttachment
        fields = "__all__"
        read_only_fields = ["id", "company", "transaction", "uploaded_at", "uploaded_by"]


class CategorySerializer(serializers.ModelSerializer):
    def validate_name(self, value):
        name = (value or "").strip()
        if not name:
            raise serializers.ValidationError("Nome obrigatório.")
        return name

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        company = getattr(request, "company", None) if request else None
        if not company and getattr(user, "company", None):
            company = user.company

        name = attrs.get("name")
        if not company or not name:
            return attrs

        role = getattr(user, "role", None) if user else None
        can_manage = bool(getattr(user, "is_superuser", False)) or bool(
            role and "finance.manage_financial" in (role.permissions or [])
        )

        is_shared = bool(attrs.get("is_shared", True))
        if not can_manage:
            is_shared = False

        qs = Category.objects.filter(company=company, name__iexact=name, is_shared=is_shared)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if not is_shared:
            qs = qs.filter(created_by=user)

        if qs.exists():
            raise serializers.ValidationError({"name": ["Já existe uma categoria com este nome."]})

        return attrs

    class Meta:
        model = Category
        fields = "__all__"
        read_only_fields = ["id", "company", "created_at", "updated_at", "created_by"]


class TransactionSerializer(serializers.ModelSerializer):
    category_details = CategorySerializer(source="category", read_only=True)
    attachments = TransactionAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Transaction
        fields = "__all__"
        read_only_fields = ["id", "company", "created_by", "created_at", "updated_at"]

    def validate_competence_date(self, value):
        request = self.context.get("request")
        if request and hasattr(request, "company"):
            is_closed = MonthClosing.objects.filter(
                company=request.company,
                month=value.month,
                year=value.year
            ).exists()
            if is_closed:
                raise serializers.ValidationError("Não é possível adicionar transações em um mês fechado.")
        return value

    def validate_category(self, value):
        """
        Garante que a categoria pertence à mesma empresa.
        """
        if value:
            # Em alguns contextos (ex: teste) request pode não ter company injetada
            request = self.context.get("request")
            if request and hasattr(request, "company"):
                if value.company != request.company:
                    raise serializers.ValidationError("Categoria inválida para esta empresa.")
                if not value.is_shared:
                    role = getattr(getattr(request, "user", None), "role", None)
                    can_manage = bool(getattr(getattr(request, "user", None), "is_superuser", False)) or (
                        role and "finance.manage_financial" in (role.permissions or [])
                    )
                    if not can_manage and value.created_by_id != getattr(request.user, "id", None):
                        raise serializers.ValidationError("Categoria inválida para este usuário.")
        return value
