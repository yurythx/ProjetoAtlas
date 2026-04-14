# Infraestrutura e Ferramentas

Este documento detalha as ferramentas de infraestrutura, qualidade de código e observabilidade integradas ao Atlas SaaS.

## 1. Celery (Processamento Assíncrono)

**O que é:**
O Celery é uma fila de tarefas distribuída baseada em mensagens. Ele permite mover operações pesadas ou demoradas (como envio de e-mails, processamento de imagens, relatórios complexos) para fora do ciclo de requisição-resposta HTTP.

**Como funciona no nosso sistema:**
- **Broker:** Utilizamos o **Redis** como intermediário (broker). O Django envia a mensagem da tarefa para o Redis.
- **Workers:** Processos Celery separados (`celery -A config worker`) monitoram o Redis, pegam as tarefas e as executam em segundo plano.
- **Beat:** Um agendador (`celery -A config beat`) que cria tarefas periódicas (ex: limpeza diária de dados, verificação de licenças expiradas).
- **Configuração:** Localizada em `backend/config/celery.py`. As tarefas são definidas nos apps usando o decorador `@shared_task`.

## 2. Sentry (Monitoramento de Erros)

**O que é:**
Uma plataforma de rastreamento de erros que ajuda os desenvolvedores a monitorar e corrigir falhas em tempo real.

**Como funciona no nosso sistema:**
- O SDK do Sentry (`sentry-sdk`) está integrado ao Django em `settings.py`.
- Quando ocorre uma exceção não tratada (Erro 500), o Sentry captura o erro, o stack trace completo e o contexto (usuário logado, tenant atual, dados da requisição).
- **Benefício:** Permite reagir a erros proativamente antes que os usuários relatem.

## 3. Redis (Cache, Broker e Canais)

**O que é:**
Um armazenamento de estrutura de dados em memória, usado como banco de dados, cache e message broker.

**Como funciona no nosso sistema:**
- **Broker do Celery:** Armazena as filas de tarefas assíncronas.
- **Cache do Django:** Armazena resultados de queries pesadas ou cálculos frequentes (configurado em `CACHES`). As chaves são prefixadas por Tenant para isolamento.
- **Channel Layer (WebSockets):** Atua como a camada de comunicação para o Django Channels (Daphne), permitindo que mensagens de chat e notificações sejam trocadas entre diferentes instâncias do servidor.
- **Sistema de Presença:** Armazena o estado "Online/Offline" dos usuários com acesso rápido.

## 4. Ruff (Linter e Formatador)

**O que é:**
Um linter e formatador de código Python extremamente rápido, escrito em Rust. Ele substitui ferramentas como Flake8, Black e isort.

**Como funciona no nosso sistema:**
- **Qualidade de Código:** Analisa o código em busca de erros de sintaxe, variáveis não usadas, importações desordenadas e violações de estilo (PEP 8).
- **Pre-commit:** Configurado via `.pre-commit-config.yaml`. Sempre que você tenta fazer um commit, o Ruff roda automaticamente para corrigir a formatação e apontar erros. Se houver erros, o commit é bloqueado até a correção.

## 5. Coverage (Cobertura de Testes)

**O que é:**
Uma ferramenta para medir a eficácia dos testes de código. Ela monitora quais linhas do código-fonte foram executadas durante a rodada de testes.

**Como funciona no nosso sistema:**
- Executamos os testes com `coverage run manage.py test`.
- O comando `coverage html` gera um relatório visual (pasta `htmlcov`) mostrando exatamente quais linhas (regras de negócio, if/else) não foram testadas.
- **Objetivo:** Garantir que funcionalidades críticas (como isolamento de dados por empresa e permissões) estejam 100% validadas.

## 6. MinIO (Object Storage)

**O que é:**
Um servidor de armazenamento de objetos de alto desempenho, compatível com a API do Amazon S3.

**Como funciona no nosso sistema:**
- **Em Desenvolvimento/Local:** O MinIO roda em um container Docker e simula o AWS S3.
- **Armazenamento de Mídia:** Quando um usuário faz upload de um arquivo (avatar, anexo no chat), o Django (via `django-storages`) salva esse arquivo no bucket do MinIO em vez do disco local do servidor.
- **Benefício:** Garante que o ambiente de desenvolvimento seja estruturalmente idêntico ao de produção (onde usaremos S3 real), evitando bugs relacionados a sistema de arquivos.
