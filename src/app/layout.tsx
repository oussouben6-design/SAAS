import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppToaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "ORGANIX — Gestion et pilotage d'organisation",
    template: "%s · ORGANIX",
  },
  description:
    "ORGANIX centralise les activités administratives, commerciales, financières, humaines et opérationnelles de votre organisation.",
  applicationName: "ORGANIX",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e293b",
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
