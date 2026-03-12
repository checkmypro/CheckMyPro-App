#!/usr/bin/env bash

# ============================================================
# CheckMyPro — Lot 1 Baseline Verification
#
# Usage:  bash scripts/verify-lot1.sh
# When:   after running npm install at the project root
# Exit:   0 if every check passes, otherwise count of failures
# ============================================================

ERRORS=0
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}  ✓${NC} $1"; }
fail() { echo -e "${RED}  ✗${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn() { echo -e "${YELLOW}  ⚠${NC} $1"; }

echo ""
echo "============================================================"
echo "  CheckMyPro Lot 1 — Baseline Verification"
echo "============================================================"

# ── 1. Node / npm ──────────────────────────────────────────
echo ""
echo "── Environment ──"
if node --version >/dev/null 2>&1; then
  pass "Node $(node --version)"
else
  fail "Node.js not found"
fi
if npm --version >/dev/null 2>&1; then
  pass "npm $(npm --version)"
else
  fail "npm not found"
fi

# ── 2. node_modules ────────────────────────────────────────
echo ""
echo "── Dependencies ──"
if [ -d "node_modules" ] || [ -d "apps/api/node_modules" ]; then
  pass "node_modules present"
else
  fail "node_modules absent — run: npm install"
fi

# ── 3. package-lock.json ──────────────────────────────────
echo ""
echo "── Lock file ──"
if [ -f "package-lock.json" ]; then
  pass "package-lock.json present"
else
  fail "package-lock.json absent — run: npm install then commit the file"
fi

# ── 4. Lint ────────────────────────────────────────────────
echo ""
echo "── Lint (ESLint) ──"
TMPFILE=$(mktemp)
npm run lint:api >"$TMPFILE" 2>&1
RC=$?
if [ "$RC" -eq 0 ]; then
  pass "npm run lint:api"
else
  fail "npm run lint:api exited with code $RC"
  echo "    Last 20 lines:"
  tail -20 "$TMPFILE" | sed 's/^/    | /'
fi
rm -f "$TMPFILE"

# ── 5. Tests (Jest) ───────────────────────────────────────
echo ""
echo "── Tests ──"
TMPFILE=$(mktemp)
npm run test:api >"$TMPFILE" 2>&1
RC=$?
if [ "$RC" -eq 0 ]; then
  pass "npm run test:api"
else
  fail "npm run test:api exited with code $RC"
  echo "    Last 25 lines:"
  tail -25 "$TMPFILE" | sed 's/^/    | /'
fi
rm -f "$TMPFILE"

# ── 6. Build ──────────────────────────────────────────────
echo ""
echo "── Build ──"
TMPFILE=$(mktemp)
npm run build:api >"$TMPFILE" 2>&1
RC=$?
if [ "$RC" -eq 0 ]; then
  pass "npm run build:api"
else
  fail "npm run build:api exited with code $RC"
  echo "    Last 20 lines:"
  tail -20 "$TMPFILE" | sed 's/^/    | /'
fi
rm -f "$TMPFILE"

if [ -f "apps/api/dist/main.js" ]; then
  pass "dist/main.js generated"
else
  fail "dist/main.js not found after build"
fi

# ── 7. Docker ─────────────────────────────────────────────
echo ""
echo "── Docker ──"
if command -v docker >/dev/null 2>&1; then
  pass "Docker available"
  TMPFILE=$(mktemp)
  docker compose -f infra/docker-compose.yml config >"$TMPFILE" 2>&1
  RC=$?
  if [ "$RC" -eq 0 ]; then
    pass "docker-compose.yml valid"
  else
    fail "docker-compose.yml invalid (exit $RC)"
  fi
  rm -f "$TMPFILE"
else
  warn "Docker not installed — skipping"
fi

# ── 8. Critical files ────────────────────────────────────
echo ""
echo "── Critical files ──"
FILES=(
  .env.example
  .github/workflows/ci.yml
  .gitignore
  README.md
  TECHNICAL_DEBT.md
  database/schema.sql
  infra/docker-compose.yml
  apps/api/src/main.ts
  apps/api/src/app.module.ts
  apps/api/.eslintrc.js
  apps/api/.prettierrc
  apps/api/tsconfig.json
  apps/api/tsconfig.build.json
  apps/api/nest-cli.json
  apps/api/src/test-setup.ts
)
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    pass "$f"
  else
    fail "MISSING $f"
  fi
done

# ── 9. AppModule ──────────────────────────────────────────
echo ""
echo "── AppModule ──"
# Count non-comment module imports — no pipes, just grep -c
ACTIVE=$(grep -c "^import.*Module.*from '\./modules" apps/api/src/app.module.ts 2>/dev/null || echo 0)
if [ "$ACTIVE" -eq 3 ]; then
  pass "3 active modules (Auth, Users, Health)"
else
  fail "Expected 3 active modules, found $ACTIVE"
fi

BULL=$(grep -c "^import.*Bull" apps/api/src/app.module.ts 2>/dev/null || echo 0)
if [ "$BULL" -eq 0 ]; then
  pass "No BullModule import"
else
  fail "BullModule imported — not expected in Lot 1"
fi

# ── 10. Test files ────────────────────────────────────────
echo ""
echo "── Test files ──"
TESTS=$(find apps/api/src -name "*.spec.ts" 2>/dev/null | wc -l)
if [ "$TESTS" -ge 1 ]; then
  pass "$TESTS test file(s) found"
else
  fail "No *.spec.ts in apps/api/src/"
fi

# ── Summary ───────────────────────────────────────────────
echo ""
echo "============================================================"
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}  ALL CHECKS PASSED${NC}"
else
  echo -e "${RED}  $ERRORS CHECK(S) FAILED — fix before proceeding${NC}"
fi
echo "============================================================"
echo ""

exit "$ERRORS"
