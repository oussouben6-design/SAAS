import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import "@testing-library/jest-dom/vitest";

/**
 * Chaque worker de test dispose de sa propre base PostgreSQL embarquée,
 * créée dans un répertoire temporaire et migrée automatiquement.
 */
process.env.DATABASE_MODE = "pglite";
process.env.ORGANIX_DATA_DIR = mkdtempSync(path.join(tmpdir(), "organix-test-"));
process.env.MAIL_TRANSPORT = "console";
process.env.APP_URL = "http://localhost:3000";
process.env.STORAGE_DRIVER = "local";
process.env.ORGANIX_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "organix-storage-"));
process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = "false";
