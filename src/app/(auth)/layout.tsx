import type { Metadata } from "next";

/**
 * Écrans d'authentification : jamais indexés.
 *
 * Ils figurent déjà dans `Disallow` (`src/app/robots.ts`) ; ce `noindex` couvre le cas où une URL
 * serait découverte par un lien externe — un écran de connexion dans les résultats de recherche
 * n'apporte rien et dilue la page publique.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
