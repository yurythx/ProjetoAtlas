# Ecossistema Backend - Documentação Técnica

Esta documentação fornece uma visão geral detalhada das principais ferramentas e serviços utilizados no backend do sistema SaaS Atlas.

## 📋 Índice

1. [Celery (Tarefas Assíncronas)](#1-celery-tarefas-assíncronas)
2. [Sentry (Monitoramento de Erros)](#2-sentry-monitoramento-de-erros)
3. [Redis (Cache e Broker)](#3-redis-cache-e-broker)
4. [Ruff (Linting e Formatação)](#4-ruff-linting-e-formatação)
5. [Coverage (Cobertura de Testes)](#5-coverage-cobertura-de-testes)
6. [MinIO (Armazenamento de Objetos)](#6-minio-armazenamento-de-objetos)

---

## 1. Celery (Tarefas Assíncronas)

### O que é?
O **Celery** é uma fila de tarefas distribuída focada em processamento em tempo real, mas que também suporta agendamento de tarefas. Ele permite que operações pesadas ou demoradas (como envio de emails, processamento de relatórios, redimensionamento de imagens) sejam executadas em segundo plano, sem bloquear a resposta da API para o usuário.

### Como funciona no nosso sistema?
No Atlas, o Celery está configurado para:
- Usar o **Redis** como *Broker* (onde as mensagens das tarefas são guardadas) e *Backend* (onde os resultados são salvos).
- Descobrir automaticamente tarefas definidas nos arquivos `tasks.py` dentro de cada app Django.

**Arquivos de Configuração:**
- `backend/config/celery.py`: Inicialização da aplicação Celery.
- `backend/config/__init__.py`: Garante que o Celery carregue junto com o Django.
- `docker-compose.yml`: Define os serviços `celery_worker` (processa tarefas) e `celery_beat` (agendador).

### Comandos Úteis

```bash
# Iniciar um worker (processador de tarefas) manualmente
celery -A config worker -l info

# Iniciar o beat (agendador de tarefas periódicas)
celery -A config beat -l info
```

---

## 2. Sentry (Monitoramento de Erros)

### O que é?
O **Sentry** é uma plataforma de monitoramento de erros e performance. Ele captura exceções não tratadas no código, lentidão em endpoints e fornece detalhes completos (stack trace, usuário afetado, contexto) para facilitar a correção de bugs.

### Como funciona no nosso sistema?
O SDK do Sentry está integrado diretamente no `settings.py`.
- **Captura**: Erros 500 (Server Error) são enviados automaticamente.
- **Ambientes**: Configurável via variável de ambiente `SENTRY_ENVIRONMENT` (ex: production, staging).
- **Traces**: `traces_sample_rate=0.1` significa que 10% das transações são monitoradas para análise de performance.

**Configuração (`settings.py`):**
```python
sentry_sdk.init(
    dsn=env("SENTRY_DSN"),
    integrations=[DjangoIntegration()],
    traces_sample_rate=0.1, # Ajustar conforme necessidade
)
```

---

## 3. Redis (Cache e Broker)

### O que é?
O **Redis** é um armazenamento de estrutura de dados em memória (in-memory data store), usado como banco de dados, cache e *message broker*. É extremamente rápido.

### Como funciona no nosso sistema?
Temos dois usos principais para o Redis:
1.  **Message Broker do Celery**: O Celery usa o Redis para gerenciar a fila de tarefas assíncronas.
2.  **Cache do Django/Channels**: Utilizado para gerenciar sessões e, especificamente, para o **Daphne/Channels** (WebSockets) gerenciar as camadas de comunicação em tempo real (chat).

**Serviço Docker:**
- Nome: `redis`
- Porta: `6379`

---

## 4. Ruff (Linting e Formatação)

### O que é?
O **Ruff** é um linter e formatador de código Python extremamente rápido, escrito em Rust. Ele substitui ferramentas como Flake8, Black, isort e pydocstyle, unificando tudo em uma única ferramenta.

### Como funciona no nosso sistema?
Ele está configurado via **Pre-commit Hooks**. Isso significa que antes de cada commit (`git commit`), o Ruff roda automaticamente para:
- Corrigir importações não ordenadas.
- Remover variáveis não usadas.
- Formatar o código para seguir o padrão PEP 8.
- Verificar erros de sintaxe.

**Configuração:**
- Arquivo: `.pre-commit-config.yaml`

### Comandos Úteis
```bash
# Rodar manualmente em todos os arquivos
python -m ruff check . --fix
```

---

## 5. Coverage (Cobertura de Testes)

### O que é?
O **Coverage.py** é uma ferramenta para medir a cobertura de código dos programas Python. Ele monitora quais partes do código foram executadas durante os testes e quais não foram, ajudando a identificar áreas não testadas.

### Como funciona no nosso sistema?
Utilizamos para garantir que nossas regras de negócio (como permissões de tenant, licenciamento e mensageria) estejam devidamente validadas.

### Comandos Úteis

```bash
# Rodar testes com cobertura
coverage run manage.py test

# Gerar relatório no terminal
coverage report

# Gerar relatório HTML visual (cria pasta htmlcov/)
coverage html
```

---

## 6. MinIO (Armazenamento de Objetos)

### O que é?
O **MinIO** é um servidor de armazenamento de objetos de alta performance, compatível com a API do **Amazon S3**. Ele permite armazenar arquivos (imagens, documentos, vídeos) de forma escalável, simulando um ambiente de nuvem (AWS S3) localmente ou em servidor próprio.

### Como funciona no nosso sistema?
Usamos o MinIO para armazenar arquivos de mídia (uploads de usuários) e estáticos, dissociando o armazenamento do servidor de aplicação (stateless backend).

**Configuração Docker:**
- **Serviço**: `minio` (Console em `:9001`, API em `:9000`).
- **Bucket Automático**: O container `createbuckets` cria automaticamente o bucket configurado em variáveis de ambiente.
- **Acesso (dev padrão)**:
    - Console: `http://localhost:9001`
    - Usuário/Senha: `minioadmin` / `minioadmin`

**Configuração Django (`settings.py`):**
Utilizamos `django-storages` com `boto3` para conectar ao MinIO como se fosse o S3.
```python
AWS_S3_ENDPOINT_URL = 'http://minio:9000'
AWS_STORAGE_BUCKET_NAME = 'blackbone-media'
```

---

**Observação**: Todas essas ferramentas já estão configuradas e integradas nos arquivos `docker-compose.yml` (desenvolvimento) e `docker-compose.prod.yml` (produção) na raiz do projeto.
