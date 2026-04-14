# Documentação de Integração Backend - Atlas SaaS

Esta documentação detalha as regras de negócio, protocolos de segurança e diretrizes de integração para o frontend do ecossistema SaaS BlackBone.

## 1. Autenticação e Multi-tenancy

O sistema utiliza uma arquitetura multi-tenant isolada logicamente. Para garantir o acesso correto aos dados, **todas** as requisições HTTP devem incluir o contexto da empresa.

### 1.1 Headers Obrigatórios (HTTP REST)

Para qualquer requisição à API (exceto endpoints públicos de `accounts`), os seguintes headers são mandatórios:

*   **Authorization**: `Bearer <access_token>` (Token JWT obtido no login)
*   **X-Company-Slug**: `<company_slug>` (Identificador único da empresa/tenant)

**Exemplo de Requisição:**

```http
GET /api/articles/ HTTP/1.1
Host: api.blackbone.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Company-Slug: blackbone-hq
```

### 1.2 Regras de Negócio de Autenticação

*   **Usuários**: São únicos globalmente pelo `username`, mas vinculados a uma `Company` principal.
*   **Login**: Ocorre sem contexto de tenant inicialmente para obter os tokens.
*   **Contexto**: O middleware `TenantMiddleware` utiliza o header `X-Company-Slug` para filtrar automaticamente todas as queries do banco de dados. Se o header estiver ausente ou inválido, a API retornará erro 404 ou 403.

---

## 2. WebSockets (Módulo Messenger)

A comunicação em tempo real é realizada via WebSockets utilizando Django Channels.

### 2.1 Conexão

Devido a limitações de clientes WebSocket em enviar headers customizados no handshake inicial (browser API), a autenticação é realizada via **Query Parameter**.

*   **Endpoint URL**: `ws://<host>/ws/chat/<conversation_id>/?token=<access_token>&company_slug=<slug>`

**Parâmetros:**
*   `conversation_id`: ID numérico da conversa.
*   `token`: Token JWT de acesso (mesmo usado na API REST).

### 2.2 Ciclo de Vida e Segurança (Backend Rules)

1.  **Handshake & Autenticação**:
    *   O `JwtAuthMiddleware` intercepta a conexão.
    *   Valida a assinatura do JWT.
    *   Recupera o usuário (bypassando filtro de tenant para garantir que o usuário seja encontrado).
    *   Se o token for inválido/expirado, a conexão é **rejeitada imediatamente**.

2.  **Validação de Negócio (Connect)**:
    *   Ao conectar, o sistema verifica se:
        *   O usuário é **participante ativo** da conversa (`conversation_id`).
        *   A conversa pertence à empresa do contexto (embora o contexto tenant seja menos rígido no WS, a validação cruzada é feita).
    *   Se o usuário não for participante, a conexão é encerrada.

3.  **Troca de Mensagens**:
    *   **Envio (Client -> Server)**:
        ```json
        {
          "message": "Olá, tudo bem?"
        }
        ```
        *Nota: Não envie o campo `sender`. O backend ignora qualquer remetente enviado pelo front e força o uso do usuário autenticado no socket para evitar spoofing.*

    *   **Recebimento (Server -> Client)**:
        ```json
        {
          "message": "Olá, tudo bem?",
          "sender": "usuario_x"
        }
        ```

---

## 3. Controle de Acesso a Módulos (Permissions)

O sistema possui um controle granular de ativação de módulos por empresa (`TenantModule`).

### 3.1 Permissão `HasModuleAccess`

Todas as Views de módulos (Articles, Messenger, Pages, etc.) são protegidas por esta permissão.

*   **Regra**: Antes de processar a requisição, o sistema verifica se o módulo correspondente está `is_active=True` para a empresa do `X-Company-Slug`.
*   **Comportamento**:
    *   Se o módulo estiver desativado: Retorna HTTP `403 Forbidden`.
    *   Frontend deve tratar esse erro redirecionando para uma página de upgrade ou "Módulo não contratado".

---

## 4. Uploads e Arquivos (Media)

### 4.1 Isolamento de Arquivos

Arquivos de mídia são armazenados com prefixo da empresa para evitar colisão e vazamento de dados.

*   **Path Padrão**: `tenants/<company_slug>/<module_name>/<filename>`
*   O frontend não precisa gerenciar isso, apenas consumir a `url` retornada pela API, que já será absoluta (S3/MinIO) ou relativa (`/media/...`) dependendo do ambiente.

---

## 5. Tratamento de Erros e Códigos HTTP

*   **401 Unauthorized**: Token JWT inválido ou expirado. Necessário refresh ou novo login.
*   **403 Forbidden**:
    *   Acesso a módulo desativado.
    *   Usuário sem permissão para o recurso.
    *   Tentativa de acessar dados de outra empresa (Cross-Tenant Access).
*   **404 Not Found**:
    *   Recurso não existe.
    *   Recurso existe mas pertence a outra empresa (Isolamento de Tenant).
    *   Header `X-Company-Slug` inválido (Tenant não encontrado).
*   **429 Too Many Requests**: Limite de taxa excedido (Rate Limiting por Tenant).

## 6. Checklist para Integração Frontend

- [ ] Garantir que o interceptor HTTP injete o header `X-Company-Slug` em **todas** as requisições autenticadas.
- [ ] Implementar lógica de Refresh Token transparente (axios interceptors).
- [ ] No WebSocket, passar o token e `company_slug` via query param na URL de conexão.
- [ ] Tratar erro 403 globalmente para identificar módulos desativados.
- [ ] Exibir mensagens de erro amigáveis para Rate Limit (429).
