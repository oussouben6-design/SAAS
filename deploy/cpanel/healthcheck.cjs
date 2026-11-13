/**
 * Contrôle de santé local, exécuté par `install-on-cpanel.sh` / `deploy.sh`.
 *
 * Il démarre `passenger.cjs` sur la boucle locale, interroge `/api/health`, puis arrête tout.
 * Objectif : distinguer un code cassé d'un Passenger/Apache mal réglé — sans dépendre du DNS,
 * du certificat ni du sous-domaine. Rien n'est exposé : l'écoute est limitée à 127.0.0.1.
 *
 *   node --env-file=.env.production deploy/cpanel/healthcheck.cjs
 *
 * Aucun secret n'est affiché. Code de sortie 0 = sain, 1 = échec.
 */
"use strict";

const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const APP_DIR = path.resolve(__dirname, "../..");
// Port haut tiré du PID : évite de réutiliser le port d'une autre application du compte.
const PORT = 41000 + (process.pid % 2000);
const TIMEOUT_MS = Number.parseInt(process.env.HEALTHCHECK_TIMEOUT_MS ?? "60000", 10);

function request(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port: PORT, host: "127.0.0.1", path: urlPath, method: "GET", timeout: 30000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer() {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await request("/api/health");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `le serveur n'a pas répondu sur 127.0.0.1:${PORT} en ${Math.round(TIMEOUT_MS / 1000)} s ` +
      `(${lastError instanceof Error ? lastError.message : "inconnu"})`,
  );
}

async function main() {
  // Le serveur écoute sur la boucle locale uniquement : rien n'est exposé à l'extérieur.
  const child = spawn(process.execPath, [path.join(APP_DIR, "passenger.cjs")], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  let exitCode = 0;
  try {
    await waitForServer();
    const health = await request("/api/health");
    const payload = (() => {
      try {
        return JSON.parse(health.body);
      } catch {
        return null;
      }
    })();
    const ok = health.status === 200 && payload?.status === "ok";
    console.info(
      `${ok ? "✓" : "✗"} /api/health → ${health.status} (${payload?.driver ?? "?"}, ` +
        `${payload?.migrations?.applied ?? "?"}/${payload?.migrations?.available ?? "?"} migrations)`,
    );
    if (!ok) {
      console.error(health.body.slice(0, 800));
      exitCode = 1;
    }
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 8000);
      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  if (exitCode !== 0 && logs.length > 0) {
    console.error("\n— journaux du démarrage (40 dernières lignes) —");
    console.error(logs.join("").split("\n").slice(-40).join("\n"));
  }
  process.exit(exitCode);
}

main();
