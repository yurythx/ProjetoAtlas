from apps.licensing.models import License, PlanFeature


def check_feature_limit(company, feature_code, current_count=None):
    """
    Verifica se a empresa atingiu o limite de uma feature específica.
    Retorna (pode_continuar, limite, atual)
    """
    # Calcular contagem se não fornecida
    if current_count is None:
        if feature_code == "max_users":
            from django.contrib.auth import get_user_model

            current_count = get_user_model().objects.filter(company=company).count()
        elif feature_code == "max_articles":
            from apps.articles.models import Article

            current_count = Article.objects.filter(company=company).count()
        else:
            current_count = 0

    # Obter licença ativa
    active_license = License.objects.filter(company=company, is_active=True).first()

    if not active_license:
        # Fallback para plano gratuito/default se não houver licença
        defaults = {"max_articles": 10, "max_users": 5}
        limit = defaults.get(feature_code, 0)
        return current_count < limit, limit, current_count

    # Obter limite da feature para este plano
    plan_feature = PlanFeature.objects.filter(plan=active_license.plan, feature__code=feature_code).first()

    if not plan_feature:
        # Fallback se a feature não estiver definida no plano (evita bloqueio total em dev)
        defaults = {"max_articles": 10, "max_users": 5}
        limit = defaults.get(feature_code, 0)
        return current_count < limit, limit, current_count

    limit_value = plan_feature.value.lower()

    if limit_value == "unlimited" or limit_value == "true":
        return True, -1, current_count

    try:
        limit_int = int(limit_value)
    except ValueError:
        return limit_value == "true", 0, current_count

    return current_count < limit_int, limit_int, current_count
