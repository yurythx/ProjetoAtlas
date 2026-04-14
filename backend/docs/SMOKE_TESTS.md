# Smoke Tests - Atlas API

Roteiro mínimo para validar rapidamente o ambiente local.

## Autenticação

```bash
API=http://localhost:8005
COMPANY=acme

curl -s -X POST "$API/api/accounts/token/" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | tee token.json

ACCESS=$(jq -r .access token.json)
```

## Messenger

```bash
curl -s "$API/api/messenger/conversations/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "X-Company-Slug: $COMPANY" | head -c 500
```

## Articles (Privado)

```bash
curl -s "$API/api/articles/articles/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "X-Company-Slug: $COMPANY" | head -c 500
```

## Articles (Público)

```bash
curl -s "$API/api/articles/public/articles/?company_slug=$COMPANY" | head -c 500
```

## Notifications

```bash
curl -s "$API/api/notifications/notifications/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "X-Company-Slug: $COMPANY" | head -c 500
```

