import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppToaster } from "@/components/ui/toaster";
import { APP_COMPANY, APP_NAME, APP_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Gestion, relation client et pilotage de la performance`,
    template: `%s · ${APP_NAME}`,
  },
  description: `${APP_TAGLINE}. ${APP_NAME}, par ${APP_COMPANY}, centralise les activités administratives, commerciales, financières, humaines et opérationnelles de votre organisation.`,
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00285e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
