from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.core.models import Company
from apps.crm.models import Column, Contact, Deal, Pipeline, Stage


class Command(BaseCommand):
    help = "Cria dados de exemplo para o módulo CRM."

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Iniciando seed do CRM..."))

        company = Company.all_companies.filter(slug="raiz").first()
        if not company:
            self.stdout.write(self.style.ERROR("Empresa 'raiz' nao encontrada. Rode seed_system primeiro."))
            return

        user = User.all_objects.filter(company=company, is_superuser=True).first()
        if not user:
            self.stdout.write(self.style.ERROR("Superusuario nao encontrado. Rode seed_system primeiro."))
            return

        # 1. Pipeline de Atendimento TI
        pipeline, created = Pipeline.objects.get_or_create(
            company=company,
            name="Suporte Técnico TI",
            defaults={"description": "Gestão de chamados e suporte interno"}
        )
        if created:
            self.stdout.write(f"  [+] Pipeline '{pipeline.name}' criado")

        # 2. Estágios (Legado)
        stages_data = ["Backlog", "Triagem", "Em Atendimento", "Aguardando Terceiro", "Finalizado"]
        stage_objs = []
        for i, name in enumerate(stages_data):
            stage, _ = Stage.objects.get_or_create(
                company=company,
                pipeline=pipeline,
                name=name,
                defaults={"order": i}
            )
            stage_objs.append(stage)

        # 3. Colunas (Novo Kanban)
        columns_data = [
            {"title": "Novo", "color": "#94A3B8", "kind": "backlog"},
            {"title": "Planejado", "color": "#60A5FA", "kind": "planned"},
            {"title": "Em Andamento", "color": "#FBBF24", "kind": "active"},
            {"title": "Concluído", "color": "#22C55E", "kind": "done"},
        ]

        for i, col_data in enumerate(columns_data):
            Column.objects.get_or_create(
                company=company,
                pipeline=pipeline,
                title=col_data["title"],
                defaults={
                    "order": i,
                    "color": col_data["color"],
                    "column_kind": col_data["kind"],
                    "marks_done": col_data["kind"] == "done"
                }
            )
        self.stdout.write("  [+] Colunas do Kanban criadas")

        # 4. Contatos
        contacts_data = [
            {"name": "Ana Silva", "email": "ana@cliente.com"},
            {"name": "Bruno Costa", "email": "bruno@empresa.com"},
            {"name": "Carla Santos", "email": "carla@rh.com"},
        ]
        contact_objs = []
        for c_data in contacts_data:
            contact, _ = Contact.objects.get_or_create(
                company=company,
                email=c_data["email"],
                defaults={"name": c_data["name"]}
            )
            contact_objs.append(contact)

        # 5. Deals (Cards)
        deals_data = [
            {"title": "Instalação de Software", "priority": "MEDIUM"},
            {"title": "Reset de Senha", "priority": "LOW"},
            {"title": "Servidor Fora do Ar", "priority": "URGENT"},
        ]

        first_column = Column.objects.filter(pipeline=pipeline).order_by("order").first()

        for i, d_data in enumerate(deals_data):
            Deal.objects.get_or_create(
                company=company,
                title=d_data["title"],
                defaults={
                    "contact": contact_objs[i % len(contact_objs)],
                    "stage": stage_objs[0],
                    "column": first_column,
                    "priority": d_data["priority"],
                    "owner": user,
                    "value": 0,
                }
            )
        self.stdout.write(self.style.SUCCESS("CRM Seeding concluído com sucesso!"))
