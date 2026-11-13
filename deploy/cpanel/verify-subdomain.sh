#!/usr/bin/env bash
# =====================================================================
# Excellence 360 CRM — vérification d'un sous-domaine cPanel LWS
#
# À exécuter en SSH sur le compte cPanel, AVANT toute installation :
#
#   bash ~/excellence360/deploy/cpanel/verify-subdomain.sh 360crm.excellence-services-sarl.com
#
# Le script ne modifie rien. Il répond à trois questions, dans cet ordre :
#   1. le sous-domaine existe-t-il et où pointe son DocumentRoot ?
#   2. où doit vivre l'application (hors du DocumentRoot) ?
#   3. Node.js est-il réellement disponible sur cette offre (version ≥ 20.9) ?
#
# Sortie 0 = tout est prêt ; sortie 1 = un point bloque (la ligne « ✗ » dit lequel).
# =====================================================================
set -euo pipefail

SUBDOMAIN="${1:-}"
HOME_DIR="${HOME:-/home/$(id -un)}"
cd "$HOME_DIR"

red() { printf '\033[1;31m%s\033[0m\n' "$*"; }
green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
blue() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

if [[ -z "$SUBDOMAIN" ]]; then
  echo "Usage : bash deploy/cpanel/verify-subdomain.sh <sous-domaine>" >&2
  echo "Exemple : bash deploy/cpanel/verify-subdomain.sh 360crm.excellence-services-sarl.com" >&2
  exit 1
fi

FAILED=0

# ---------------------------------------------------------------- 1. sous-domaine
blue "1/3 Sous-domaine : $SUBDOMAIN"
DOC_ROOT=""
if command -v uapi >/dev/null 2>&1; then
  # uapi sort du JSON : on l'analyse sans dépendre de jq (absent sur beaucoup de comptes).
  LIST_JSON="$(uapi --output=json DomainInfo list_domains 2>/dev/null || true)"
  if [[ -n "$LIST_JSON" ]]; then
    DOC_ROOT="$(printf '%s' "$LIST_JSON" | node -e '
      let raw = "";
      process.stdin.on("data", (c) => (raw += c));
      process.stdin.on("end", () => {
        try {
          const data = JSON.parse(raw).result?.data ?? {};
          const wanted = process.argv[1];
          for (const key of ["sub_domains", "addon_domains", "main_domain"]) {
            const value = data[key];
            if (typeof value === "string" && value === wanted) {
              process.stdout.write(data.documentroot ?? "");
              return;
            }
            if (Array.isArray(value) && value.includes(wanted)) {
              process.stdout.write(data.documentroot ?? "");
              return;
            }
          }
        } catch {
          /* sortie vide : le repli ci-dessous prend le relais */
        }
      });
    ' "$SUBDOMAIN")"
  fi
fi

if [[ -n "$DOC_ROOT" ]]; then
  green "✓ Sous-domaine déclaré — DocumentRoot : $DOC_ROOT"
else
  red "✗ Sous-domaine introuvable dans cPanel (ou Node.js absent pour lire l'API)."
  echo "  → cPanel → Domaines → Créer un domaine → Sous-domaine : \"360crm\" sur le domaine racine."
  echo "    Cochez « Partagez ce DocumentRoot » = décoché (dossier dédié), puis Force HTTPS."
  FAILED=1
  DOC_ROOT="${HOME_DIR}/public_html/${SUBDOMAIN%%.*}"
fi

# L'application ne doit JAMAIS être à l'intérieur du DocumentRoot : Passenger publierait
# package.json, .env.production et le code source.
REL_DOC="${DOC_ROOT#"$HOME_DIR"/}"
case "$REL_DOC" in
  public_html/*|public_html)
    APP_DIR="${HOME_DIR}/apps/excellence360"
    ;;
  *)
    APP_DIR="${DOC_ROOT%/}-app"
    ;;
esac

blue "2/3 Emplacements"
echo "  DocumentRoot (fichiers servis) : $DOC_ROOT"
echo "  Application (code privé)       : $APP_DIR"
if [[ "$APP_DIR" == "$DOC_ROOT" || "$APP_DIR" == "$DOC_ROOT"/* ]]; then
  red "✗ L'application serait à l'intérieur du DocumentRoot : elle serait téléchargeable."
  echo "  → créez le sous-domaine avec un DocumentRoot dédié, ou déplacez l'application."
  FAILED=1
fi
if [[ -e "$APP_DIR" ]]; then
  echo "  (le dossier existe déjà : le script d'installation y mettra le code à jour)"
fi

# ---------------------------------------------------------------- 3. Node.js
blue "3/3 Node.js (Phusion Passenger)"
if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -v)"
  NODE_MAJOR="${NODE_VERSION#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  if (( NODE_MAJOR >= 20 )); then
    green "✓ node $NODE_VERSION — compatible (≥ 20.9 exigé par package.json)"
  else
    red "✗ node $NODE_VERSION — trop ancien"
    echo "  → cPanel → Setup Node.js App → modifier l'application : choisissez Node.js 22."
    FAILED=1
  fi
else
  red "✗ node introuvable dans ce terminal"
  echo "  → cPanel → Setup Node.js App : l'offre doit être une formule **cPanel LWS** (L, XL, 2XL, 3XL ou CloudCP)."
  echo "    Les formules « LWS Panel » (Perso/Pro/Business) n'exécutent pas Node.js : il faut le plan cPanel."
  FAILED=1
fi
if command -v npm >/dev/null 2>&1; then
  echo "  npm $(npm -v)"
fi
echo "  (si node répond mais pas dans le bon environnement : copiez la commande"
echo "   « source /home/<compte>/nodevenv/<app>/<version>/bin/activate » affichée par cPanel)"

echo
if (( FAILED == 0 )); then
  green "Tout est prêt. Étape suivante :"
  echo "  bash $APP_DIR/deploy/cpanel/install-on-cpanel.sh"
else
  red "Un ou plusieurs points bloquent l'installation : corrigez-les, puis relancez ce script."
  exit 1
fi
