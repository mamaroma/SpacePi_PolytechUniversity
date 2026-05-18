#!/usr/bin/env bash
# deploy.sh — pull latest code and restart services with zero downtime.
# Usage:
#   ./deploy.sh             # full redeploy (pull + rebuild + restart)
#   ./deploy.sh --no-pull   # skip git pull (e.g. already on the right commit)
#   ./deploy.sh --no-build  # skip docker build (e.g. only config changed)

set -euo pipefail

# ── Configurable defaults ──────────────────────────────────────────────────────
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PULL=true
BUILD=true

for arg in "$@"; do
  case "$arg" in
    --no-pull)  PULL=false ;;
    --no-build) BUILD=false ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--no-pull] [--no-build]"
      exit 1
      ;;
  esac
done

# ── Helpers ────────────────────────────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
ok()   { echo "[$(date '+%H:%M:%S')] ✓ $*"; }
fail() { echo "[$(date '+%H:%M:%S')] ✗ $*" >&2; exit 1; }

# ── 1. Git pull ────────────────────────────────────────────────────────────────
if $PULL; then
  log "Pulling latest commits from origin/$GIT_BRANCH …"
  git fetch --prune origin
  git checkout "$GIT_BRANCH"
  git pull --ff-only origin "$GIT_BRANCH" || fail "git pull failed — resolve conflicts manually"
  ok "Repository is up to date ($(git rev-parse --short HEAD))"
fi

# ── 2. Sanity checks ───────────────────────────────────────────────────────────
[[ -f ".env" ]] || fail ".env not found — copy .env.example and fill in secrets"
[[ -f "$COMPOSE_FILE" ]] || fail "$COMPOSE_FILE not found"

command -v docker &>/dev/null || fail "docker is not installed"
docker compose version &>/dev/null || fail "docker compose plugin not found"

# ── 3. Build images ────────────────────────────────────────────────────────────
if $BUILD; then
  log "Building images (api + ui) …"
  docker compose -f "$COMPOSE_FILE" build --pull api ui
  ok "Images built"
fi

# ── 4. Start / recreate services ──────────────────────────────────────────────
log "Starting services …"

# Bring up the database first and wait for it to be healthy
docker compose -f "$COMPOSE_FILE" up -d db
log "Waiting for PostgreSQL to be ready …"
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T db \
      pg_isready -U spacepi -d spacepi &>/dev/null; then
    ok "PostgreSQL is healthy"
    break
  fi
  [[ $i -eq 30 ]] && fail "PostgreSQL did not become healthy in time"
  sleep 2
done

# Recreate api and ui (--no-deps because db is already up)
docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate api ui
ok "Services started"

# ── 5. Wait for the API health check ──────────────────────────────────────────
log "Waiting for API health check …"
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T api \
      curl -sf http://localhost:8000/api/satellites &>/dev/null; then
    ok "API is healthy"
    break
  fi
  [[ $i -eq 30 ]] && {
    log "API is not responding — showing last 40 lines of logs:"
    docker compose -f "$COMPOSE_FILE" logs --tail=40 api
    fail "API health check failed"
  }
  sleep 3
done

# ── 6. Print status ────────────────────────────────────────────────────────────
echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
ok "Deploy complete  🛰  commit=$(git rev-parse --short HEAD)"
