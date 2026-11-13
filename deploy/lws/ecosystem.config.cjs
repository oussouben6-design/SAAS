/**
 * PM2 — gestion du processus Next.js sur le serveur LWS (Cloud KVM / VPS).
 *
 * Pourquoi PM2 et pas un simple `npm start` : redémarrage après plantage, reprise au démarrage du
 * serveur (`pm2 startup`), rotation des journaux et rechargement sans coupure (`pm2 reload`).
 *
 * Le processus écoute sur 127.0.0.1 uniquement : seul Apache, sur la même machine, peut l'atteindre.
 * Le port 3000 n'est donc jamais exposé directement à Internet.
 */
module.exports = {
  apps: [
    {
      name: "excellence360-crm",
      cwd: "/var/www/excellence360",
      // Démarrage direct du binaire Next.js : évite un processus npm intermédiaire qui masque les
      // signaux d'arrêt et fausse les redémarrages.
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      max_memory_restart: "900M",
      kill_timeout: 8000,
      wait_ready: false,
      // Les variables de production vivent dans .env.production (chmod 600), jamais dans ce fichier.
      env: {
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      error_file: "/var/log/excellence360/error.log",
      out_file: "/var/log/excellence360/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
