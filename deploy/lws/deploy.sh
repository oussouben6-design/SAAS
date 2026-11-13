#!/usr/bin/env bash
# =====================================================================
# Excellence 360 CRM — déploiement sur le serveur LWS (Cloud KVM / VPS)
#
# Exécution, en tant qu'utilisateur applicatif, depuis le dossier du projet :
#     sudo -u excellence360 bash /var/www/excellence360/deploy/lws/deploy.sh
#
# Ce que fait le script, dans cet ordre, en s'arrêtant au premier échec :
#   1. récupère la branche de production (git fetch + reset --hard)
#   2. installe les dépendances exactes du lockfile (npm ci)
#   3. contrôle la configuration (env:check) AVANT de construire
#   4. construit l'application (next build)
#   5. recharge PM2 sans coupure, puis vérifie /api/health
#   6. en cas d'échec : affiche les dernières lignes de journal et sort en erreur
#
# Variables facultatives :
#   BRANCH=main        branche à déployer
#   SKIP_PULL=1        ne pas toucher au dépôt (déploiement d'un code déjà copié)
#   HEALTH_TIMEOUT=60  secondes d'attente de /api/health
# =====================================================================
set -euo pipefail

APP_NAME="excellence360-crm"
BRANCH="${BRANCH:-main}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
PORT="${PORT:-3000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ -f .env.production ]] || fail ".env.production absent : copiez deploy/lws/env.production.example puis renseignez les secrets."

log "1/6 · Code source (branche ${BRANCH})"
if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  git fetch --prune origin "${BRANCH}"
  git checkout -q "${BRANCH}" 2>/dev/null || git checkout -q -B "${BRANCH}" "origin/${BRANCH}"
  git reset -q --hard "origin/${BRANCH}"
fi
echo "Commit déployé : $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

log "2/6 · Dépendances (lockfile)"
npm ci --no-audit --no-fund

log "3/6 · Contrôle de configuration (aucune valeur affichée)"
npx tsx --env-file=.env.production scripts/env-check.ts || fail "Configuration refusée : corrigez .env.production (le détail ci-dessus indique quoi et où)."

log "4/6 · Build de production"
npm run build

log "5/6 · Rechargement du processus"
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  pm2 reload deploy/lws/ecosystem.config.cjs --update-env
else
  pm2 start deploy/lws/ecosystem.config.cjs
  pm2 save
fi

log "6/6 · Vérification (/api/health)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -fsS "http://127.0.0.1:${PORT}/api/health" -o /tmp/excellence360-health.json 2>/dev/null; do
  if [[ $(date +%s) -ge ${deadline} ]]; then
    echo "--- dernières lignes de journal ---" >&2
    pm2 logs "${APP_NAME}" --lines 40 --nostream >&2 || true
    fail "L'application ne répond pas sur 127.0.0.1:${PORT} après ${HEALTH_TIMEOUT}s."
  fi
  sleep 2
done
cat /tmp/excellence360-health.json; echo
grep -q '"status":"ok"' /tmp/excellence360-health.json || fail "L'application répond mais se déclare dégradée (voir le JSON ci-dessus)."

log "Déploiement terminé : $(git rev-parse --short HEAD)"
