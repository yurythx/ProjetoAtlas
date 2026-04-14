# Atlas SaaS - Backend API

![Python](https://img.shields.io/badge/Python-3.12-blue)
![Django](https://img.shields.io/badge/Django-5.0-green)
![Coverage](https://img.shields.io/badge/Coverage-93%25-brightgreen)
![Status](https://img.shields.io/badge/Status-Stable-success)
![CI](https://github.com/yurythx/atlas/actions/workflows/ci.yml/badge.svg)

Bem-vindo ao repositório backend do **BlackBone**, uma plataforma SaaS Multi-tenant robusta e escalável.

## 📋 Sobre o Projeto

O BlackBone é um sistema projetado para atender múltiplas empresas (Tenants) simultaneamente, com total isolamento de dados lógico. Ele oferece uma arquitetura modular onde features podem ser habilitadas ou desabilitadas conforme o plano contratado.

### Principais Funcionalidades
*   **Multi-tenancy Lógico**: Isolamento de dados via `company_id` em todas as tabelas críticas.
*   **Gestão de Assinaturas e Planos**: Controle de features via licenças (Free, Pro, Enterprise).
*   **Módulos Dinâmicos**: Ativação/desativação de módulos (Pages, Articles, Messenger) por tenant.
*   **Comunicação em Tempo Real**: Chat WebSocket utilizando Django Channels e Redis.
*   **Processamento Assíncrono**: Filas de tarefas com Celery para operações pesadas.
*   **Armazenamento de Objetos**: Compatibilidade com S3 (AWS/MinIO) para uploads.
*   **Monitoramento**: Integração nativa com Sentry para rastreamento de erros.

---

## 🏗️ Arquitetura e Tecnologias

O sistema segue uma arquitetura baseada em **Shared Database, Shared Schema**, onde o contexto do tenant é resolvido via Middleware.

### Stack Tecnológico
*   **Framework**: Django 5.0 + Django Rest Framework
*   **Banco de Dados**: PostgreSQL 16
*   **Cache & Broker**: Redis 7
*   **Async/WebSockets**: Daphne + Channels + Celery
*   **Storage**: MinIO (Dev) / AWS S3 (Prod)
*   **Qualidade**: Ruff (Linting) + Coverage (Testes)

### Documentação Detalhada
Para detalhes profundos sobre cada ferramenta do ecossistema, consulte:
👉 **[Ecossistema Técnico e Ferramentas](docs/ECOSYSTEM.md)**

---

## 🚀 Como Executar (Docker) - Recomendado

A maneira mais fácil de rodar a aplicação é utilizando Docker Compose, que sobe todo o ambiente (Banco, Redis, MinIO, Backend, Workers).

### Pré-requisitos
*   Docker e Docker Compose instalados.

### Passos
1.  **Clonar o repositório**
2.  **Configurar Variáveis**: O projeto já vem com configurações padrão para Docker no `docker-compose.yml`.
3.  **Subir os serviços**:
    ```bash
    docker-compose up -d --build
    ```
4.  **Acessar a API**: `http://localhost:8005`

### Serviços Disponíveis
*   **API**: `http://localhost:8005`
*   **MinIO Console** (Arquivos): `http://localhost:9001` (User/Pass: `minioadmin`)
*   **Swagger/Docs**: `http://localhost:8005/api/schema/swagger-ui/`

---

## 💻 Desenvolvimento Local

Se preferir rodar localmente (sem Docker para o backend), você ainda precisará do Postgres e Redis rodando.

1.  **Ambiente Virtual**:
    ```bash
    python -m venv venv
    .\venv\Scripts\activate  # Windows
    # source venv/bin/activate  # Linux/Mac
    ```
2.  **Instalar Dependências**:
    ```bash
    pip install -r requirements.txt
    ```
3.  **Configurar .env**: Copie `.env.example` para `.env` e ajuste as credenciais do banco.
4.  **Migrações e Dados Iniciais**:
    ```bash
    python manage.py migrate
    python manage.py seed_data  # Cria empresas e usuários de teste
    ```
5.  **Rodar Servidor**:
    ```bash
    python manage.py runserver
    ```

---

## 🧪 Testes e Qualidade

O projeto possui alta cobertura de testes automatizados (93%+).

### Rodar Testes
```bash
# Via Docker (Recomendado)
docker-compose exec backend coverage run manage.py test

# Localmente
coverage run manage.py test
```

### Verificar Cobertura
```bash
# Gerar relatório no terminal
docker-compose exec backend coverage report

# Gerar HTML detalhado
docker-compose exec backend coverage html
```

### Linting (Ruff)
O código é verificado automaticamente via Pre-commit hooks.
```bash
# Rodar verificação manual
python -m ruff check .
```

### Pre-commit Hooks
Para garantir padronização automática antes de cada commit:
```bash
pip install pre-commit
pre-commit install
# Rodar em todo o repositório
pre-commit run --all-files
```

### CI
Cada PR/Push roda:
- Lint (ruff, black, isort, pre-commit)
- Testes Django (manage.py test)
Workflow: `.github/workflows/ci.yml`

---

## 🔑 Guia de Uso da API

### Headers Obrigatórios
Como o sistema é multi-tenant, você deve informar qual empresa está acessando os dados.

| Header | Valor | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `Authorization` | `Bearer <token>` | Sim (exceto login) | Token JWT de acesso. |
| `X-Company-Slug` | `<slug_da_empresa>` | Sim | Identifica o Tenant (ex: `blackbone`, `ironminds`). |

### Fluxo de Autenticação
1.  **Login**: `POST /api/accounts/token/` (Recebe Access e Refresh Token).
2.  **Obter Perfil**: `GET /api/accounts/users/me/` (Descobre quais empresas o usuário pertence).
3.  **Usar API**: Nas próximas chamadas, envie o `X-Company-Slug` escolhido.

---

## 📂 Estrutura de Pastas

*   `apps/`: Aplicações Django (Core, Accounts, Licensing, Messenger, etc).
*   `config/`: Configurações globais do projeto (Settings, Celery, URLs).
*   `shared_kernel/`: Códigos reutilizáveis e Core do Multi-tenancy (Middleware, Base Models).
*   `docs/`: Documentação complementar.

---

## 🛡️ Segurança

*   **Senhas**: Hashing via PBKDF2 (Padrão Django).
*   **Permissões**: RBAC (Role Based Access Control) + Verificação de Módulo Contratado.
*   **Dados**: Isolamento lógico forçado pelo `TenantManager`.

---

**Desenvolvido com ❤️ pela equipe BlackBone.**
