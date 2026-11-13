#!/usr/bin/env bash
# =====================================================================
# Excellence 360 CRM — mise à jour sur cPanel LWS (Passenger)
#
#   bash ~/apps/excellence360/deploy/cpanel/deploy.sh
#   APP_BRANCH=main bash …/deploy.sh        (autre branche)
#
# Équivalent cPanel de ce que fait l'ancien kit VPS, sans root :
#   code → dépendances → env:check → build → reload Passenger → santé locale.
# S'arrête au premier échec, en affichant où regarder.
#
# En automatique : .github/workflows/deploy-cpanel.yml (SSH après CI verte sur main).
# =====================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
BRANCH="${APP_BRANCH:-main}"
LOG_DIR="$APP_DIR/.deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

exec > >(tee -a "$LOG_FILE") 2>&1
trap 'printf "\033[1;31mÉchec — journal : %s\033[0m\n" "$LOG_FILE"' ERR

echo "▶ Mise à jour de $APP_DIR (branche $BRANCH)"
echo "  journal : $LOG_FILE"

# 1. Environnement Node.js (cPanel fournit un environnement par application).
if ! command -v node >/dev/null 2>&1; then
  echo "✗ node introuvable : sourcez l'environnement de l'application (cPanel → Setup Node.js App)." >&2
  exit 1
fi
node -v

# 2. Code. Sans dépôt Git (code déposé par FTP), l'étape est simplement ignorée.
if [[ -d .git ]]; then
  git fetch --depth 1 origin "$BRANCH"
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  echo "  commit : $(git log -1 --format='%h %s')"
else
  echo "  pas de dépôt Git ici : utilisation du code présent"
fi

# 3. Variables : obligatoires, et jamais lisibles par les autres comptes.
ENV_FILE="$APP_DIR/.env.production"
[[ -f "$ENV_FILE" ]] || { echo "✗ .env.production absent — copiez deploy/cpanel/env.production.example." >&2; exit 1; }
chmod 600 "$ENV_FILE"

# 4. Dépendances exactes du verrou.
npm ci --no-audit --no-fund

# 5. Configuration : refuse un déploiement qui ne pourrait pas fonctionner.
node --env-file="$ENV_FILE" --import tsx scripts/env-check.ts

# 6. Build. Passenger ne construit rien : le build doit exister AVANT le redémarrage.
NEXT_TELEMETRY_DISABLED=1 npm run build

# 7. Relance Passenger (surveille tmp/restart.txt).
mkdir -p tmp
touch tmp/restart.txt
echo "  redémarrage demandé (tmp/restart.txt)"

# 8. Santé : démarre passenger.cjs localement et interroge /api/health.
node --env-file="$ENV_FILE" deploy/cpanel/healthcheck.cjs

# 9. Contrôle public (si APP_URL est renseignée) : détecte un Passenger inactif.
# shellcheck disable=SC1090
APP_URL_VALUE="$(grep -E '^[[:space:]]*APP_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"'')"
if [[ -n "$APP_URL_VALUE" ]]; then
  echo "▶ Contrôle HTTPS public sur $APP_URL_VALUE"
  bash deploy/cpanel/check-remote.sh "$APP_URL_VALUE" || {
    echo "⚠ Le site répond mal en HTTPS (voir ci-dessus). Le processus local est sain :"
    echo "  le problème est côté Apache/Passenger (.htaccess du DocumentRoot, Force HTTPS)."
    exit 1
  }
fi

echo "✓ Déploiement terminé."
