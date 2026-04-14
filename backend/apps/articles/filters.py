from django_filters import rest_framework as filters

from .models import Article


class ArticleFilter(filters.FilterSet):
    title = filters.CharFilter(lookup_expr="icontains")
    content = filters.CharFilter(lookup_expr="icontains")
    category = filters.NumberFilter(field_name="category__id")
    author = filters.NumberFilter(field_name="author__id")
    status = filters.CharFilter()
    tags = filters.CharFilter(field_name="tags__name")
    created_at_after = filters.DateTimeFilter(field_name="created_at", lookup_expr="gte")
    created_at_before = filters.DateTimeFilter(field_name="created_at", lookup_expr="lte")
    slug = filters.CharFilter(lookup_expr="exact")

    class Meta:
        model = Article
        fields = ["category", "author", "status", "title", "content", "tags", "slug"]


class PublicArticleFilter(filters.FilterSet):
    title = filters.CharFilter(lookup_expr="icontains")
    content = filters.CharFilter(lookup_expr="icontains")
    # Usamos NumberFilter para evitar validação de choices que falha devido ao TenantManager
    category = filters.NumberFilter(field_name="category__id")
    # Para tags, permitimos filtrar pelo nome da tag
    tags = filters.CharFilter(method="filter_tags")
    # E também pelo ID se necessário
    tag_id = filters.NumberFilter(field_name="tags__id")
    company_slug = filters.CharFilter(field_name="company__slug")

    class Meta:
        model = Article
        fields = ["category", "title", "content", "tags", "tag_id", "company_slug"]

    def filter_tags(self, queryset, name, value):
        raw = (value or "").strip()
        if not raw:
            return queryset
        if raw.isdigit():
            return queryset.filter(tags__id=int(raw))
        return queryset.filter(tags__name=raw)
