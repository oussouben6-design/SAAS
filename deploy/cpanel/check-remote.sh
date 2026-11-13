#!/usr/bin/env bash
# =====================================================================
# Excellence 360 CRM — contrôle HTTPS après déploiement (cPanel LWS)
#
#   bash deploy/cpanel/check-remote.sh https://360crm.excellence-services-sarl.com
#
# Vérifie ce que voient réellement les visiteurs et les moteurs de recherche :
# santé, fichiers de référencement, balises de l'accueil, et surtout que le site
# n'est PAS servi par un répertoire Apache vide (symptôme classique d'un
# Passenger non activé : 403/« Index of / »).
#
# Utilisé par .github/workflows/deploy-cpanel.yml, réutilisable à la main.
# Code de sortie 1 dès le premier contrôle en échec.
# =====================================================================
set -euo pipefail

SITE="${1:-${SITE_URL:-}}"
if [[ -z "$SITE" ]]; then
  echo "Usage : bash deploy/cpanel/check-remote.sh https://votre-sous-domaine" >&2
  exit 1
fi
SITE="${SITE%/}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
get() { curl -fsS --max-time 30 -o "$TMP/$2" -w '%{http_code}' "$SITE$1"; }

echo "Contrôles sur $SITE"

# 1. Santé : base joignable et migrations à jour (source : /api/health, sans donnée métier).
CODE="$(get /api/health health.json)"
[[ "$CODE" == "200" ]] || fail "/api/health → $CODE"
grep -q '"status":"ok"' "$TMP/health.json" || fail "/api/health ne répond pas \"ok\" : $(head -c 300 "$TMP/health.json")"
MIGRATIONS="$(node -e 'try{const h=require(process.argv[1]);console.log(`${h.migrations?.applied}/${h.migrations?.available}`)}catch{console.log("?")}' "$TMP/health.json" 2>/dev/null || echo "?")"
ok "/api/health → 200 ($MIGRATIONS migrations)"

# 2. Accueil : 200 ET contenu applicatif. Un « Index of / » ou une page Apache
#    signifie que Passenger n'a pas pris la main : c'est le défaut le plus fréquent.
CODE="$(get / home.html)"
[[ "$CODE" == "200" ]] || fail "/ → $CODE"
if grep -qiE 'Index of /|<title>403 Forbidden|Apache2 Debian Default Page|It works!' "$TMP/home.html"; then
  fail "/ renvoie une page Apache au lieu de l'application : Passenger n'est pas actif
    → vérifiez PassengerEnabled on / PassengerAppRoot dans le .htaccess du DocumentRoot
    → et « Setup Node.js App » (startup file : passenger.cjs)"
fi
grep -q 'rel="canonical"' "$TMP/home.html" || fail "balise canonique absente de /"
grep -q 'property="og:title"' "$TMP/home.html" || fail "Open Graph absent de /"
if grep -qi 'canonical" href="https\?://localhost' "$TMP/home.html"; then
  fail "canonique en localhost : NEXT_PUBLIC_SITE_URL est mal réglée"
fi
if grep -qi '<meta[^>]+name="robots"[^>]+content="[^"]*noindex' "$TMP/home.html"; then
  fail "l'accueil est en noindex : il ne sera pas référencé"
fi
ok "/ → 200, canonique et Open Graph présents, indexable"

# 3. Référencement : robots.txt et sitemap.xml générés par Next.js.
CODE="$(get /robots.txt robots.txt)"
[[ "$CODE" == "200" ]] || fail "/robots.txt → $CODE (proxy/Passenger ne transmet pas ce chemin)"
grep -qi 'sitemap:[[:space:]]*https\?://' "$TMP/robots.txt" || fail "robots.txt ne déclare pas le sitemap"
grep -qi 'disallow:[[:space:]]*/app' "$TMP/robots.txt" || fail "robots.txt n'exclut pas /app"
ok "/robots.txt → 200, sitemap déclaré et /app exclu"

CODE="$(get /sitemap.xml sitemap.xml)"
[[ "$CODE" == "200" ]] || fail "/sitemap.xml → $CODE"
grep -q '<urlset' "$TMP/sitemap.xml" || fail "sitemap.xml invalide"
grep -q '<loc>https://' "$TMP/sitemap.xml" || fail "sitemap.xml ne contient pas d'URL absolues en HTTPS"
ok "/sitemap.xml → 200, URL absolues"

# 4. Sécurité de base : le code source ne doit jamais être téléchargeable.
for path in /.env.production /package.json /passenger.cjs; do
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE$path")"
  if [[ "$STATUS" == "200" ]]; then
    fail "$path est téléchargeable (HTTP 200) : le DocumentRoot contient l'application"
  fi
done
ok "code source et secrets non téléchargeables"

echo
ok "Tous les contrôles sont passés sur $SITE"
