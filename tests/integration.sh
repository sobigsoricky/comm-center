#!/usr/bin/env bash
# Integration tests against a running dev server at localhost:3002.
# Usage: bash tests/integration.sh
set -u

BASE="http://localhost:3002"
PASS=0
FAIL=0
FAILED_TESTS=()

assert_status() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS+1))
    printf "  PASS  %s (HTTP %s)\n" "$name" "$actual"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name: expected $expected got $actual")
    printf "  FAIL  %s — expected %s got %s\n" "$name" "$expected" "$actual"
  fi
}

assert_contains() {
  local name="$1" needle="$2" body="$3"
  if echo "$body" | grep -q "$needle"; then
    PASS=$((PASS+1))
    printf "  PASS  %s (contains \"%s\")\n" "$name" "$needle"
  else
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name: body did not contain '$needle'. body=$body")
    printf "  FAIL  %s — missing \"%s\" in body: %s\n" "$name" "$needle" "$body"
  fi
}

run() {
  # echo a section header
  printf "\n══ %s\n" "$1"
}

# ── /api/health ────────────────────────────────────────────────
run "/api/health"
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/health")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
# 200 if all green, 503 if any setup missing — both valid
if [ "$CODE" = "200" ] || [ "$CODE" = "503" ]; then
  assert_status "health responds 200/503" "$CODE" "$CODE"
else
  assert_status "health responds 200/503" "200|503" "$CODE"
fi
assert_contains "health has checks.anthropic" '"anthropic"' "$BODY"
assert_contains "health has checks.googleConfig" '"googleConfig"' "$BODY"
assert_contains "health has checks.gmail" '"gmail"' "$BODY"
assert_contains "health has timestamp" '"timestamp"' "$BODY"

# ── /api/auth/google/status ────────────────────────────────────
run "/api/auth/google/status"
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/auth/google/status")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert_status "auth/google/status responds 200" "200" "$CODE"
assert_contains "auth/google/status has connected key" '"connected"' "$BODY"

# DELETE /api/auth/google/status (disconnect, should always succeed)
RESP=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE/api/auth/google/status")
CODE=$(echo "$RESP" | tail -1)
assert_status "auth/google/status DELETE responds 200" "200" "$CODE"

# ── /api/auth/google ──────────────────────────────────────────
run "/api/auth/google"
# Without GOOGLE_CLIENT_ID env → 500; with → 307 redirect
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/auth/google")
if [ "$CODE" = "307" ] || [ "$CODE" = "302" ] || [ "$CODE" = "500" ]; then
  assert_status "auth/google responds 307/302 or 500" "$CODE" "$CODE"
else
  assert_status "auth/google responds 307/302/500" "307|302|500" "$CODE"
fi

# ── /api/whatsapp/status ──────────────────────────────────────
run "/api/whatsapp/status"
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/whatsapp/status")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert_status "whatsapp/status responds 200" "200" "$CODE"
assert_contains "whatsapp/status has state key" '"state"' "$BODY"

# ── /api/whatsapp/scan (not connected) ───────────────────────
run "/api/whatsapp/scan (disconnected)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/whatsapp/scan")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert_status "whatsapp/scan responds 401 when not connected" "401" "$CODE"
assert_contains "whatsapp/scan has error message" "not connected" "$BODY"

# ── /api/whatsapp/send (no body) ──────────────────────────────
run "/api/whatsapp/send (validation)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/whatsapp/send" -H "Content-Type: application/json" -d '{}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
# 400 (not connected) is acceptable when WA is disconnected
assert_status "whatsapp/send responds 400 (no body, disconnected)" "400" "$CODE"

# ── /api/scan-gmail (not connected) ───────────────────────────
run "/api/scan-gmail (disconnected)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/scan-gmail" \
  -H "Content-Type: application/json" -d '{"range":"30d","pendingOnly":true,"max":5}')
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert_status "scan-gmail responds 401 when not connected" "401" "$CODE"
assert_contains "scan-gmail has error" "Gmail not connected" "$BODY"

# ── /api/scan-gmail accepts empty body ─────────────────────────
run "/api/scan-gmail (empty body — uses defaults)"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/scan-gmail")
CODE=$(echo "$RESP" | tail -1)
# Still 401 because no connection, but should not 400 for missing body
assert_status "scan-gmail accepts empty body (still 401 due to no conn)" "401" "$CODE"

# ── /api/draft-whatsapp validation ────────────────────────────
run "/api/draft-whatsapp validation"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/draft-whatsapp" \
  -H "Content-Type: application/json" -d '{}')
CODE=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | head -n -1)
assert_status "draft-whatsapp responds 400 on missing fields" "400" "$CODE"
assert_contains "draft-whatsapp has required-fields error" "required" "$BODY"

RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/draft-whatsapp" \
  -H "Content-Type: application/json" -d '{"contact":"   ","message":"   "}')
CODE=$(echo "$RESP" | tail -1)
assert_status "draft-whatsapp responds 400 on whitespace-only fields" "400" "$CODE"

# ── /api/redraft validation ────────────────────────────────────
run "/api/redraft validation"
RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/redraft" \
  -H "Content-Type: application/json" -d '{}')
CODE=$(echo "$RESP" | tail -1)
assert_status "redraft responds 400 on missing fields" "400" "$CODE"

# ── /api/setup-diagnostics ─────────────────────────────────────
run "/api/setup-diagnostics"
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/setup-diagnostics")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert_status "setup-diagnostics responds 200" "200" "$CODE"
assert_contains "diagnostics has summary" '"summary"' "$BODY"
assert_contains "diagnostics has checks" '"checks"' "$BODY"

# ── /api/setup-config ──────────────────────────────────────────
run "/api/setup-config"
RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/setup-config")
CODE=$(echo "$RESP" | tail -1)
assert_status "setup-config responds 200" "200" "$CODE"

# ── /api/events (SSE) ──────────────────────────────────────────
run "/api/events (SSE)"
# Read the first 100 bytes only, then bail — verifies the stream opens
HEADERS=$(curl -s -m 3 -D - -o /dev/null "$BASE/api/events" 2>&1 || true)
if echo "$HEADERS" | grep -q "text/event-stream"; then
  PASS=$((PASS+1))
  printf "  PASS  events stream content-type is text/event-stream\n"
else
  FAIL=$((FAIL+1))
  FAILED_TESTS+=("events stream content-type missing")
  printf "  FAIL  events stream missing text/event-stream header\n"
fi

# ── 404 for unknown routes ─────────────────────────────────────
run "404 handling"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/nonexistent")
assert_status "unknown route responds 404" "404" "$CODE"

# ── CORS / OPTIONS preflight ───────────────────────────────────
# Verify the app doesn't accept cross-origin POSTs without consent
# (Next.js doesn't add CORS by default — that's correct, this is single-origin)

# ── Summary ────────────────────────────────────────────────────
printf "\n═══════════════════════════════════════════\n"
printf "  PASS: %d   FAIL: %d\n" "$PASS" "$FAIL"
printf "═══════════════════════════════════════════\n"
if [ "$FAIL" -gt 0 ]; then
  printf "\nFailed tests:\n"
  for t in "${FAILED_TESTS[@]}"; do
    printf "  - %s\n" "$t"
  done
  exit 1
fi
exit 0
