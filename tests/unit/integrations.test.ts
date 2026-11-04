import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { appBaseUrl, mailTransport, renderMail, sendMail } from "@/lib/mail";
import {
  buildStoragePath,
  deleteStoredFile,
  readStoredFile,
  sanitizeFilename,
  saveFile,
  storageDriver,
  storedFileSize,
} from "@/lib/storage";

const envKeys = [
  "MAIL_TRANSPORT",
  "MAIL_FROM",
  "RESEND_API_KEY",
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "STORAGE_DRIVER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "ORGANIX_STORAGE_DIR",
] as const;

const originalEnv: Record<string, string | undefined> = {};
for (const key of envKeys) originalEnv[key] = process.env[key];

function restoreEnv() {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}

beforeEach(() => {
  for (const key of envKeys) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreEnv();
});

describe("e-mails transactionnels", () => {
  it("utilise le transport console par défaut sans prétendre avoir envoyé", async () => {
    expect(mailTransport()).toBe("console");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await sendMail({
      to: "demo@organix.test",
      subject: "Vérifiez votre e-mail",
      kind: "email_verification",
      actionUrl: "http://localhost:3000/verifier-email?token=abc",
      lines: ["Bonjour Amina,"],
    });
    expect(info).toHaveBeenCalled();
    expect(result.delivered).toBe(false);
    expect(result.transport).toBe("console");
    expect(result.previewUrl).toContain("/verifier-email?token=abc");
    expect(result.warning).toMatch(/aucun e-mail/i);
  });

  it("échoue explicitement quand le transport resend n'a pas de clé", async () => {
    process.env.MAIL_TRANSPORT = "resend";
    const result = await sendMail({
      to: "demo@organix.test",
      subject: "Test",
      kind: "invitation",
      actionUrl: "http://localhost:3000/invitations/xyz",
    });
    expect(result.delivered).toBe(false);
    expect(result.warning).toMatch(/RESEND_API_KEY/);
  });

  it("appelle l'API Resend avec la clé, l'expéditeur et le contenu HTML", async () => {
    process.env.MAIL_TRANSPORT = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "ORGANIX <no-reply@organix.test>";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendMail({
      to: "direction@organix.test",
      subject: "Réinitialisation du mot de passe",
      kind: "password_reset",
      actionUrl: "https://app.organix.test/reinitialiser-mot-de-passe?token=t",
      lines: ["Bonjour Bakary,"],
    });

    expect(result).toEqual({ delivered: true, transport: "resend" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe("ORGANIX <no-reply@organix.test>");
    expect(body.to).toEqual(["direction@organix.test"]);
    expect(body.html).toContain("Réinitialisation du mot de passe");
    expect(body.text).toContain("Bonjour Bakary");
  });

  it("remonte un échec HTTP du fournisseur sans faux succès", async () => {
    process.env.MAIL_TRANSPORT = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "no-reply@organix.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid api key", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendMail({
      to: "x@organix.test",
      subject: "Test",
      kind: "invitation",
      actionUrl: "https://app.organix.test/invitations/1",
    });
    expect(result.delivered).toBe(false);
    expect(result.warning).toMatch(/HTTP 401/);
  });

  it("échappe le HTML des variables injectées", () => {
    const { html } = renderMail({
      to: "x@organix.test",
      subject: "Test",
      kind: "invitation",
      actionUrl: "https://app.organix.test/invitations/1?x=<script>",
      lines: ["<b>Balise</b>"],
    });
    expect(html).not.toContain("<b>Balise</b>");
    expect(html).toContain("&lt;b&gt;Balise&lt;/b&gt;");
    expect(html).not.toContain("<script>");
  });

  it("détermine l'URL de base de l'application", () => {
    expect(appBaseUrl()).toBe("http://localhost:3000");
    process.env.APP_URL = "https://app.organix.test/";
    expect(appBaseUrl()).toBe("https://app.organix.test");
  });
});

describe("stockage des fichiers", () => {
  it("nettoie les noms de fichiers et construit un chemin sûr", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("Rapport été 2026 (final).pdf")).toBe("Rapport_ete_2026_final_.pdf");
    const storagePath = buildStoragePath("org-1", "doc-1", "Contrat signé.pdf");
    expect(storagePath).toBe("org-1/doc-1-Contrat_signe.pdf");
  });

  it("enregistre, relit, mesure et supprime un fichier en stockage local", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "organix-storage-"));
    process.env.ORGANIX_STORAGE_DIR = dir;
    expect(storageDriver()).toBe("local");

    const storagePath = buildStoragePath("org-1", "doc-1", "note.txt");
    await saveFile(storagePath, Buffer.from("contenu de test", "utf8"));
    expect(await storedFileSize(storagePath)).toBe(Buffer.byteLength("contenu de test"));
    const content = await readStoredFile(storagePath);
    expect(content.toString("utf8")).toBe("contenu de test");

    await deleteStoredFile(storagePath);
    expect(await storedFileSize(storagePath)).toBe(0);
    await expect(readStoredFile(storagePath)).rejects.toThrow();
    await rm(dir, { recursive: true, force: true });
  });

  it("refuse un chemin hors du répertoire de stockage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "organix-storage-"));
    process.env.ORGANIX_STORAGE_DIR = dir;
    await expect(saveFile("../evasion.txt", Buffer.from("x"))).rejects.toThrow(/invalide/i);
    await rm(dir, { recursive: true, force: true });
  });

  it("envoie les fichiers vers Supabase Storage quand le pilote est configuré", async () => {
    process.env.STORAGE_DRIVER = "supabase";
    process.env.SUPABASE_URL = "https://projet.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_STORAGE_BUCKET = "documents";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveFile("org-1/doc-1-note.txt", Buffer.from("abc"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://projet.supabase.co/storage/v1/object/documents/org-1/doc-1-note.txt");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer service-role-key");
    expect(headers.apikey).toBe("service-role-key");
    expect((init as RequestInit).method).toBe("POST");

    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array(Buffer.from("abc")), {
        status: 200,
        headers: { "content-length": "3" },
      }),
    );
    const read = await readStoredFile("org-1/doc-1-note.txt");
    expect(read.toString("utf8")).toBe("abc");
  });

  it("signale une configuration Supabase incomplète au lieu de simuler un succès", async () => {
    process.env.STORAGE_DRIVER = "supabase";
    await expect(saveFile("org-1/doc-1.txt", Buffer.from("x"))).rejects.toThrow(/SUPABASE_URL/);
  });

  it("remonte une erreur d'écriture distante", async () => {
    process.env.STORAGE_DRIVER = "supabase";
    process.env.SUPABASE_URL = "https://projet.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bucket not found", { status: 404 })));
    await expect(saveFile("org-1/doc-1.txt", Buffer.from("x"))).rejects.toThrow(/HTTP 404/);
  });
});
