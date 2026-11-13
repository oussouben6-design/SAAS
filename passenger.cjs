/**
 * Fichier de démarrage pour Phusion Passenger (hébergement cPanel LWS).
 *
 * cPanel n'autorise ni `next start`, ni pm2, ni un port TCP dédié : Passenger démarre CE fichier
 * (« Application startup file ») et lui transmet les requêtes par un socket Unix, en remplaçant
 * `http.Server.listen()`. `next start` ne peut donc pas être utilisé ; on reproduit ici ce qu'il
 * fait — charger la configuration, préparer le serveur — en gardant la main sur `listen()`.
 *
 * Trois responsabilités, dans cet ordre :
 *   1. charger `.env.production` (Next.js ne le fait pas pour un serveur personnalisé) ;
 *   2. créer le serveur Next.js et le présenter à Passenger (`listen('passenger')`) ;
 *   3. hors Passenger (développement local), écouter sur un port TCP classique.
 */
"use strict";

const APP_DIR = __dirname;
const IS_PASSENGER = typeof PhusionPassenger !== "undefined";

/* ------------------------------------------------------------------ 1. environnement */

// `next build` lit `.env.production` tout seul ; un serveur personnalisé doit le faire lui-même.
// Sans cela, la base, le stockage et les URL de production seraient absents au démarrage.
if (!process.env.__EXCELLENCE360_ENV_LOADED) {
  const { loadEnvConfig } = require("@next/env");
  loadEnvConfig(APP_DIR, process.env.NODE_ENV === "production", {
    info: () => {},
    error: console.error,
  });
  process.env.__EXCELLENCE360_ENV_LOADED = "1";
}
process.env.NODE_ENV = process.env.NODE_ENV || "production";

/* ------------------------------------------------------------------ 2. serveur Next.js */

const http = require("node:http");

async function start() {
  // `next` exporte la fonction de création directement (CJS), avec un `.default` selon la version.
  const nextModule = require("next");
  const next = typeof nextModule === "function" ? nextModule : nextModule.default;

  const app = next({
    dir: APP_DIR,
    dev: false,
    // Passenger fournit l'hôte réel dans la requête : aucune URL absolue n'est construite à
    // partir de cette valeur, elle sert uniquement aux journaux.
    hostname: "localhost",
    port: Number.parseInt(process.env.PORT ?? "3000", 10) || 3000,
  });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = http.createServer((req, res) => {
    // Passenger transmet le chemin d'origine et l'hôte public ; on ne réécrit rien, sinon les
    // redirections (HTTPS, `/app` → connexion) perdraient le domaine des liens calculés.
    handle(req, res).catch((error) => {
      console.error("[excellence360] requête en échec :", req.method, req.url, error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
      }
      res.end("Erreur interne — consultez les journaux de l'application.");
    });
  });

  // WebSocket (HMR en développement, flux serveur) : même gestionnaire que `next start`.
  try {
    const upgradeHandler = app.getUpgradeHandler();
    server.on("upgrade", (req, socket, head) => {
      upgradeHandler(req, socket, head).catch(() => socket.destroy());
    });
  } catch {
    /* version de Next sans gestionnaire d'upgrade : sans effet en production */
  }

  if (IS_PASSENGER) {
    // Passenger remplace listen() : le port est ignoré, la communication passe par un socket
    // Unix interne à Apache. Ne JAMAIS passer un port TCP ici.
    server.listen("passenger", () => {
      console.log(`[excellence360] prêt (Passenger) — ${APP_DIR}`);
    });
  } else {
    // Hors Passenger (contrôle local, développement) : port TCP classique, boucle locale par défaut
    // pour ne jamais exposer l'application directement à Internet depuis un hébergement partagé.
    const port = Number.parseInt(process.env.PORT ?? "3000", 10) || 3000;
    const host = process.env.HOSTNAME ?? "127.0.0.1";
    server.listen(port, host, () => {
      console.log(`[excellence360] prêt — http://${host}:${port}`);
    });
  }

  // Arrêt propre : Passenger envoie SIGTERM au redémarrage (tmp/restart.txt).
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 8000).unref();
    });
  }
}

start().catch((error) => {
  console.error("[excellence360] démarrage impossible :", error);
  // Sortie non nulle : Passenger affiche l'erreur dans le journal Apache et renvoie 503,
  // plutôt qu'un processus zombie qui répondrait à toutes les requêtes par une erreur muette.
  process.exit(1);
});
