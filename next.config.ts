import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * En-têtes appliqués uniquement en production.
 *
 * CSP : bloquer les scripts/styles/images d'origines tierces, les `<object>`, les formulaires
 * externes et le détournement de `<base>`. `'unsafe-inline'` reste nécessaire pour les scripts
 * injectés par Next.js (aucun nonce n'est généré) — la CSP protège donc contre l'inclusion de
 * ressources tierces, pas contre toute injection inline. Limite documentée dans docs/securite.md.
 *
 * HSTS n'est envoyé qu'en production (HTTPS) pour ne pas verrouiller les aperçus de développement.
 */
const productionHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Hôtes autorisés à demander les ressources de développement (aperçus distants).
   * En production, le build n'utilise pas ce réglage.
   */
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost", "127.0.0.1"],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    const headers =
      process.env.NODE_ENV === "production"
        ? [...securityHeaders, ...productionHeaders]
        : securityHeaders;
    return [
      {
        source: "/(.*)",
        headers,
      },
    ];
  },
};

export default nextConfig;
