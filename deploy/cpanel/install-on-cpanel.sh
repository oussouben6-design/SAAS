#!/usr/bin/env bash
# =====================================================================
# Excellence 360 CRM — installation sur un compte cPanel LWS
#
# Node.js est fourni par cPanel via Phusion Passenger : PAS de root, PAS de
# systemd, PAS de PM2, PAS de reverse proxy. Passenger démarre
# `passenger.cjs` (racine du projet) et lui transmet les requêtes par un
# socket Unix ; ce fichier relaie tout vers Next.js.
#
#   bash ~/excellence360/deploy/cpanel/install-on-cpanel.sh
#
# Prérequis (une seule fois, dans cPanel) :
#   · sous-domaine créé        → voir deploy/cpanel/verify-subdomain.sh
#   · Setup Node.js App        → Node 22, « Application startup file » = passenger.cjs
#   · .env.production          → copié depuis deploy/cpanel/env.production.example
#
# Le script est idempotent : le relancer met à jour le code et reconstruit.
# Il n'écrit aucun secret (les variables vivent dans .env.production, chmod 600).
# =====================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"

REPO_URL="${EXCELLENCE360_REPO:-https://github.com/oussouben6-design/SAAS.git}"
BRANCH="${EXCELLENCE360_BRANCH:-main}"
LOG_DIR="$APP_DIR/.deploy-logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

red() { printf '\033[1;31m%s\033[0m\n' "$*"; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
blue() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

# Tout est journalisé : en cas d'échec, le fichier de log est le seul témoin
# (Passenger n'affiche pas stdout/stderr dans le navigateur).
exec > >(tee -a "$LOG_FILE") 2>&1
trap 'red "Échec — journal complet : $LOG_FILE"' ERR

blue "1/9 Environnement"
echo "Dossier : $APP_DIR"
echo "Journal : $LOG_FILE"
if ! command -v node >/dev/null 2>&1; then
  red "node est introuvable."
  echo "→ cPanel → Setup Node.js App : créez l'application (Node 22, startup file passenger.cjs),"
  echo "  puis relancez ce script depuis le terminal de l'application (ou après avoir copié"
  echo "  la commande « source …/bin/activate » affichée par cPanel)."
  exit 1
fi
NODE_MAJOR="$(node -v | tr -d v | cut -d. -f1)"
if (( NODE_MAJOR < 20 )); then
  red "Node $(node -v) trop ancien : package.json exige ≥ 20.9."
  echo "→ cPanel → Setup Node.js App : passez l'application en Node.js 22, puis relancez."
  exit 1
fi
green "node $(node -v) · npm $(npm -v)"

blue "2/9 Code source"
if [[ -d "$APP_DIR/.git" ]]; then
  git fetch --depth 1 origin "$BRANCH"
  # -B (et non un simple checkout) : fonctionne aussi quand la branche n'existe pas encore
  # localement, ce qui est le cas d'un clone fraîchement créé sur le serveur.
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
  git reset --hard "origin/$BRANCH"
  green "Code à jour : $(git log -1 --format='%h %s')"
elif [[ -f "$APP_DIR/package.json" ]]; then
  echo "Pas de dépôt Git ici (code déjà copié) : rien à récupérer."
else
  red "Aucun code dans $APP_DIR."
  echo "→ clonez d'abord le dépôt :"
  echo "  git clone $REPO_URL $APP_DIR"
  exit 1
fi

blue "3/9 Variables de production"
ENV_FILE="$APP_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  red "Fichier .env.production absent."
  echo "→ cp deploy/cpanel/env.production.example .env.production"
  echo "  puis renseignez-la (base Supabase, Storage, Resend) : sans elle, le build s'arrête"
  echo "  sur env:check et le site ne peut pas démarrer."
  exit 1
fi
chmod 600 "$ENV_FILE"
# Un fichier vide n'est pas un fichier renseigné : on refuse un démarrage muet.
if ! grep -Eq '^[[:space:]]*(DATABASE_URL|APP_URL)=[^[:space:]]+' "$ENV_FILE"; then
  red ".env.production ne contient ni DATABASE_URL ni APP_URL renseignées."
  echo "→ ouvrez-le (nano .env.production) et remplissez au minimum DATABASE_URL, SUPABASE_URL,"
  echo "  SUPABASE_SERVICE_ROLE_KEY et APP_URL : voir deploy/cpanel/env.production.example."
  exit 1
fi
green ".env.production présent (droits 600)"

# Les scripts exécutés ci-dessous (env:check, build) doivent voir les mêmes valeurs que
# l'application : on les exporte depuis .env.production. Le fichier de démarrage
# (passenger.cjs) les recharge lui-même au démarrage du serveur.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1

blue "4/9 Contrôle de configuration (env:check)"
node --env-file="$ENV_FILE" --import tsx scripts/env-check.ts
green "Configuration valide"

blue "5/9 Dépendances (package-lock exact)"
if [[ -f package-lock.json ]]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

blue "6/9 Build de production"
# Passenger n'exécute pas de commande de build : il faut le build AVANT le démarrage.
# Le build est déterministe ; le cache incrémental (.next/cache) reste entre deux déploiements.
NEXT_TELEMETRY_DISABLED=1 npm run build
green "Build terminé"

blue "7/9 Redémarrage de l'application Passenger"
touch "$APP_DIR/tmp/restart.txt" 2>/dev/null || {
  mkdir -p "$APP_DIR/tmp"
  touch "$APP_DIR/tmp/restart.txt"
}
green "Redémarrage demandé (tmp/restart.txt) : Passenger relance passenger.cjs à la requête suivante"

blue "8/9 Contrôles locaux"
# On démarre passenger.cjs sur la boucle locale (127.0.0.1), sans passer par Apache : cela
# distingue « code cassé » de « Passenger/Apache mal réglé », sans dépendre du DNS.
if node --env-file="$ENV_FILE" deploy/cpanel/healthcheck.cjs; then
  green "passenger.cjs démarre et /api/health est sain"
else
  red "Le serveur Next.js ne répond pas correctement."
  echo "→ journaux : tail -n 100 ~/logs/*.log (ou cPanel → Mesures → Erreurs)"
  echo "→ causes usuelles : DATABASE_URL en IPv6 directe (utilisez le pooler, port 6543),"
  echo "  variable manquante, ou build absent."
  exit 1
fi

blue "9/9 Récapitulatif"
if [[ -n "${APP_URL:-}" ]]; then
  echo "Adresse publique : $APP_URL"
  echo "Contrôle HTTPS : curl -I $APP_URL   → doit répondre 200"
fi
echo "URL du sous-domaine côté cPanel : vérifiez Domaines → $APP_DIR est bien HORS du DocumentRoot."
green "Déploiement terminé."
echo "Prochaine étape recommandée (depuis un poste de développement) :"
echo "  npm run smoke -- --url https://<votre-sous-domaine> --token <jeton>"
