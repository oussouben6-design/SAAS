#!/usr/bin/env bash
# =====================================================================
# Excellence 360 CRM — préparation d'un serveur LWS (Cloud KVM / VPS)
#
# À exécuter UNE FOIS, en root, sur un serveur Debian 12 / Ubuntu 22.04+ :
#
#   scp deploy/lws/install-server.sh root@<IP>:/root/
#   ssh root@<IP> 'bash /root/install-server.sh'
#
# Idempotent : peut être relancé sans casser une installation existante.
# Installe Node.js 22, PM2, Apache (proxy), certbot, le pare-feu et fail2ban.
# Ne contient aucun secret et ne modifie jamais la base de données.
# =====================================================================
set -euo pipefail

APP_USER="excellence360"
APP_DIR="/var/www/excellence360"
LOG_DIR="/var/log/excellence360"
NODE_MAJOR="22"
DOMAIN="360crm.excellence-services-sarl.com"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (sudo)." >&2
  exit 1
fi

log "Mise à jour du système"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

log "Paquets de base"
apt-get install -y -qq ca-certificates curl gnupg git build-essential rsync \
  apache2 certbot python3-certbot-apache ufw fail2ban logrotate

log "Node.js ${NODE_MAJOR} (dépôt NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v
npm -v

log "PM2 (gestion du processus)"
npm install -g pm2@latest --no-audit --no-fund

log "Utilisateur applicatif ${APP_USER} (sans privilèges)"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  adduser --system --group --home "/home/${APP_USER}" --shell /bin/bash "${APP_USER}"
fi

log "Répertoires"
mkdir -p "${APP_DIR}" "${LOG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" "${LOG_DIR}"
chmod 750 "${LOG_DIR}"

log "Modules Apache (proxy, en-têtes, réécriture, HTTP/2)"
a2enmod -q proxy proxy_http headers rewrite ssl http2 >/dev/null 2>&1 || true
a2enmod -q brotli >/dev/null 2>&1 || true
a2enmod -q deflate >/dev/null 2>&1 || true
a2dissite -q 000-default >/dev/null 2>&1 || true

log "Durcissement Apache"
cat > /etc/apache2/conf-available/excellence360-hardening.conf <<'CONF'
ServerTokens Prod
ServerSignature Off
TraceEnable Off
Timeout 60
KeepAlive On
MaxKeepAliveRequests 200
# Le proxy ne doit jamais relayer une requête vers un hôte arbitraire.
ProxyRequests Off
CONF
a2enconf -q excellence360-hardening >/dev/null 2>&1 || true

log "Rotation des journaux (PM2)"
cat > /etc/logrotate.d/excellence360 <<'CONF'
/var/log/excellence360/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su excellence360 excellence360
}
CONF

log "Pare-feu (SSH, HTTP, HTTPS uniquement)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

log "fail2ban (protection SSH)"
systemctl enable --now fail2ban >/dev/null 2>&1 || true

log "Redémarrage d'Apache"
apache2ctl configtest
systemctl enable apache2
systemctl restart apache2

log "Reprise automatique du processus applicatif au démarrage"
sudo -u "${APP_USER}" bash -lc "pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER}" >/dev/null || true

cat <<EOF

=====================================================================
Serveur prêt. Étapes suivantes (voir docs/lws.md § 3 à § 5) :

1. Déposer le code, en tant que ${APP_USER} :
     sudo -u ${APP_USER} git clone <dépôt> ${APP_DIR}
     # ou copie par rsync depuis votre poste

2. Créer ${APP_DIR}/.env.production à partir de deploy/lws/env.production.example :
     sudo -u ${APP_USER} nano ${APP_DIR}/.env.production
     chmod 600 ${APP_DIR}/.env.production

3. Déployer :
     sudo -u ${APP_USER} bash ${APP_DIR}/deploy/lws/deploy.sh

4. Apache : copier deploy/lws/apache/${DOMAIN}.conf
     cp ${APP_DIR}/deploy/lws/apache/${DOMAIN}.conf /etc/apache2/sites-available/
     a2ensite ${DOMAIN} && apache2ctl configtest && systemctl reload apache2

5. Certificat HTTPS :
     certbot --apache -d ${DOMAIN} -d www.${DOMAIN} --redirect -m <votre-email> --agree-tos

DNS (chez LWS) : enregistrement A  ${DOMAIN%%.*}  → IP de ce serveur.
=====================================================================
EOF
