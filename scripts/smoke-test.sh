#!/bin/bash
# =============================================================
# ATLAS — Smoke Test pós-deploy
# =============================================================
# Uso:
#   ./scripts/smoke-test.sh                         # usa localhost padrão
#   BASE_URL=https://meudominio.com ./scripts/smoke-test.sh
#   COMPANY_SLUG=raiz EMAIL=admin@raiz.com PASSWORD=senha ./scripts/smoke-test.sh
# =============================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8005}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3005}"
COMPANY_SLUG="${COMPANY_SLUG:-raiz}"
EMAIL="${EMAIL:-admin@atlas.local}"
PASSWORD="${PASSWORD:-admin}"

PASS=0
FAIL=0
SKIPPED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

pass() { echo -e "  ${GREEN}✓${RESET} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${RESET} $1"; ((FAIL++)); }
skip() { echo -e "  ${YELLOW}–${RESET} $1 (skipped)"; ((SKIPPED++)); }

check_http() {
  local label="$1" url="$2" expected="${3:-200}"
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$actual" = "$expected" ]; then
    pass "$label → HTTP $actual"
  else
    fail "$label → expected $expected, got $actual ($url)"
  fi
}

check_json_key() {
  local label="$1" url="$2" key="$3"
  local body
  body=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "{}")
  if echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if '$key' in d else 1)" 2>/dev/null; then
    pass "$label → key '$key' present"
  else
    fail "$label → key '$key' missing in response"
  fi
}

echo ""
echo -e "${BOLD}=== Atlas Smoke Test ===${RESET}"
echo -e "  Backend:  ${BASE_URL}"
echo -e "  Frontend: ${FRONTEND_URL}"
echo -e "  Company:  ${COMPANY_SLUG}"
echo ""

# ── 1. Health check ───────────────────────────────────────────
echo -e "${BOLD}1. Health Checks${RESET}"
check_json_key "Detailed health" "${BASE_URL}/api/health/" "status"
check_json_key "Health checks.database" "${BASE_URL}/api/health/" "checks"

# ── 2. Public endpoints ───────────────────────────────────────
echo -e "\n${BOLD}2. Public Endpoints${RESET}"
check_http "Public company list" "${BASE_URL}/api/core/companies/public_list/" 200
check_http "Public articles"     "${BASE_URL}/api/articles/?is_public=true" 200
check_http "Modules list"        "${BASE_URL}/api/modules/" 200
check_http "Frontend home"       "${FRONTEND_URL}/" 200

# ── 3. Auth flow ─────────────────────────────────────────────
echo -e "\n${BOLD}3. Auth Flow${RESET}"
TOKEN_RESP=$(curl -s --max-time 10 -X POST "${BASE_URL}/api/accounts/token/" \
  -H "Content-Type: application/json" \
  -H "X-Company-Slug: ${COMPANY_SLUG}" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" 2>/dev/null || echo "{}")

ACCESS_TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access',''))" 2>/dev/null || echo "")

if [ -n "$ACCESS_TOKEN" ]; then
  pass "Login → JWT obtained"
else
  fail "Login → no access token received"
  echo -e "  ${RED}Response: $(echo "$TOKEN_RESP" | head -c 200)${RESET}"
fi

AUTH="-H 'Authorization: Bearer ${ACCESS_TOKEN}' -H 'X-Company-Slug: ${COMPANY_SLUG}'"

# ── 4. Authenticated core endpoints ──────────────────────────
echo -e "\n${BOLD}4. Authenticated Endpoints${RESET}"
if [ -n "$ACCESS_TOKEN" ]; then
  _get() {
    curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "X-Company-Slug: ${COMPANY_SLUG}" \
      "$1" 2>/dev/null || echo "000"
  }

  [[ "$(_get "${BASE_URL}/api/core/companies/current/")" = "200" ]] && pass "Company current" || fail "Company current"
  [[ "$(_get "${BASE_URL}/api/modules/my-modules/")" = "200" ]] && pass "Tenant modules (cached)" || fail "Tenant modules"
  [[ "$(_get "${BASE_URL}/api/core/dashboard/stats/")" =~ ^(200|403)$ ]] && pass "Dashboard stats (200 or 403 perm)" || fail "Dashboard stats"
  [[ "$(_get "${BASE_URL}/api/notifications/notifications/")" = "200" ]] && pass "Notifications" || fail "Notifications"
  [[ "$(_get "${BASE_URL}/api/crm/pipelines/")" =~ ^(200|403)$ ]] && pass "CRM pipelines" || fail "CRM pipelines"
  [[ "$(_get "${BASE_URL}/api/crm/deals/?page_size=5")" =~ ^(200|403)$ ]] && pass "CRM deals" || fail "CRM deals"
  [[ "$(_get "${BASE_URL}/api/finance/transactions/")" =~ ^(200|403)$ ]] && pass "Finance transactions" || fail "Finance transactions"
  [[ "$(_get "${BASE_URL}/api/messenger/conversations/")" =~ ^(200|403)$ ]] && pass "Messenger conversations" || fail "Messenger conversations"
  [[ "$(_get "${BASE_URL}/api/reports/crm/export/")" =~ ^(200|403|405)$ ]] && pass "Reports CRM export endpoint exists" || fail "Reports CRM export"
else
  skip "Authenticated endpoints (no token)"
fi

# ── 5. Admin endpoints ────────────────────────────────────────
echo -e "\n${BOLD}5. Admin / Schema${RESET}"
check_http "OpenAPI schema"  "${BASE_URL}/api/schema/"  200
check_http "Swagger UI"      "${BASE_URL}/api/docs/"    200

# ── 6. PWA / Service Worker ───────────────────────────────────
echo -e "\n${BOLD}6. PWA Assets${RESET}"
check_http "Service Worker"  "${FRONTEND_URL}/sw.js"        200
check_http "Web App Manifest" "${FRONTEND_URL}/manifest.json" 200

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=== Results ===${RESET}"
echo -e "  ${GREEN}Passed:${RESET}  ${PASS}"
echo -e "  ${RED}Failed:${RESET}  ${FAIL}"
echo -e "  ${YELLOW}Skipped:${RESET} ${SKIPPED}"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}${BOLD}SMOKE TEST FAILED — ${FAIL} check(s) did not pass.${RESET}"
  exit 1
else
  echo -e "${GREEN}${BOLD}SMOKE TEST PASSED.${RESET}"
  exit 0
fi
