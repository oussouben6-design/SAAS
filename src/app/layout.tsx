import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppToaster } from "@/components/ui/toaster";
import { APP_COMPANY, APP_NAME, APP_TAGLINE } from "@/lib/brand";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LANGUAGE,
  SITE_LOCALE,
  SITE_NAME,
  SITE_OG_IMAGE,
  organizationJsonLd,
  siteUrl,
} from "@/lib/seo";

/**
 * Métadonnées globales — référencement public.
 *
 * Le contenu à indexer est la vitrine (`/`) ; l'espace client est exclu par `robots.txt` et par un
 * `noindex` explicite dans `src/app/app/layout.tsx`. `metadataBase` rend absolues toutes les URL
 * relatives (canonique, image de partage) : sans lui, Next.js émet des URL `localhost` dans les
 * balises Open Graph en production.
 *
 * Vérification Google Search Console (facultative) : poser `GOOGLE_SITE_VERIFICATION` dans
 * l'environnement — la balise n'est alors ajoutée qu'à ce moment.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [...SITE_KEYWORDS],
  authors: [{ name: APP_COMPANY }],
  creator: APP_COMPANY,
  publisher: APP_COMPANY,
  category: "business",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: SITE_LOCALE,
    url: "/",
    siteName: SITE_NAME,
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [SITE_OG_IMAGE.url],
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-icon.png" }],
    shortcut: ["/icon.png"],
  },
  other: {
    "geo.region": "NE",
    "geo.placename": "Niamey",
  },
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00285e",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = organizationJsonLd();
  return (
    <html lang={SITE_LANGUAGE}>
      <body className="min-h-dvh antialiased">
        {children}
        <AppToaster />
        {/* Données structurées : organisation éditrice + application (résultats enrichis). */}
        <script
          type="application/ld+json"
          // Contenu constant, généré côté serveur : aucun paramètre utilisateur.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
