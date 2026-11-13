import { describe, expect, it } from "vitest";
import {
  PRODUCTION_SITE_URL,
  PUBLIC_PAGES,
  ROBOTS_DISALLOW,
  SITE_DESCRIPTION,
  absoluteUrl,
  organizationJsonLd,
  siteUrl,
} from "@/lib/seo";

/**
 * Référencement : l'URL publique ne doit jamais dépendre d'un `localhost` oublié, et rien de
 * l'espace client ne doit être indexable. Ces tests figent les deux règles.
 */
describe("URL publique", () => {
  it("retombe sur le domaine de production sans variable", () => {
    expect(siteUrl({})).toBe(PRODUCTION_SITE_URL);
    expect(PRODUCTION_SITE_URL).toBe("https://360crm.excellence-services-sarl.com");
  });

  it("privilégie NEXT_PUBLIC_SITE_URL, puis APP_URL", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://crm.exemple.com", APP_URL: "https://autre.com" })).toBe(
      "https://crm.exemple.com",
    );
    expect(siteUrl({ APP_URL: "https://app.exemple.com" })).toBe("https://app.exemple.com");
  });

  it("retire les slashs finaux et ajoute le schéma manquant", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://crm.exemple.com///" })).toBe("https://crm.exemple.com");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "crm.exemple.com" })).toBe("https://crm.exemple.com");
  });

  it("construit des URL absolues pour les balises", () => {
    const env = { NEXT_PUBLIC_SITE_URL: "https://crm.exemple.com" };
    expect(absoluteUrl("/logo.png", env)).toBe("https://crm.exemple.com/logo.png");
    expect(absoluteUrl("logo.png", env)).toBe("https://crm.exemple.com/logo.png");
    expect(absoluteUrl("https://cdn.exemple.com/a.png", env)).toBe("https://cdn.exemple.com/a.png");
  });
});

describe("Indexation", () => {
  it("exclut l'espace client, les API et les liens d'invitation", () => {
    for (const path of ["/app", "/api/", "/connexion", "/invitations/"]) {
      expect(ROBOTS_DISALLOW).toContain(path);
    }
  });

  it("ne publie au sitemap que des pages publiques absolues", () => {
    expect(PUBLIC_PAGES.length).toBeGreaterThan(0);
    for (const page of PUBLIC_PAGES) {
      expect(page.path.startsWith("/")).toBe(true);
      expect(page.path.startsWith("/app")).toBe(false);
      expect(page.priority).toBeGreaterThan(0);
    }
  });
});

describe("Données structurées", () => {
  it("décrit l'organisation et l'application avec des URL absolues", () => {
    const json = JSON.stringify(organizationJsonLd({ NEXT_PUBLIC_SITE_URL: "https://crm.exemple.com" }));
    expect(json).toContain('"@type":"Organization"');
    expect(json).toContain('"@type":"SoftwareApplication"');
    expect(json).toContain("https://crm.exemple.com/#organization");
    expect(json).not.toContain("excellence-services-sarl.com");
  });

  it("expose une description exploitable par les moteurs", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(80);
    expect(SITE_DESCRIPTION).toContain("Excellence 360 CRM");
  });
});
