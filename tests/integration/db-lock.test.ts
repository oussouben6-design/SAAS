import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireDataDirLock } from "@/lib/db/client";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "organix-lock-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("verrou du répertoire PGlite", () => {
  it("pose un verrou avec le PID courant et le retire à la libération", () => {
    const dir = path.join(tempDir(), "pglite");
    const release = acquireDataDirLock(dir);
    const lock = JSON.parse(readFileSync(path.join(dir, ".organix-instance.lock"), "utf8")) as {
      pid: number;
    };
    expect(lock.pid).toBe(process.pid);
    release();
    expect(() => readFileSync(path.join(dir, ".organix-instance.lock"), "utf8")).toThrow();
  });

  it("refuse une seconde ouverture dans le même processus", () => {
    const dir = tempDir();
    const release = acquireDataDirLock(dir);
    try {
      expect(() => acquireDataDirLock(dir)).toThrow(/déjà ouverte dans ce processus/);
    } finally {
      release();
    }
    // Après libération, une nouvelle ouverture est autorisée.
    const again = acquireDataDirLock(dir);
    again();
  });

  it("refuse un répertoire utilisé par un autre processus vivant", () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, ".organix-instance.lock"),
      JSON.stringify({ pid: 1, startedAt: new Date().toISOString(), command: "npm run dev" }),
    );
    expect(() => acquireDataDirLock(dir)).toThrow(/déjà utilisée par le processus 1/);
  });

  it("remplace un verrou orphelin laissé par un processus mort", () => {
    const dir = tempDir();
    writeFileSync(
      path.join(dir, ".organix-instance.lock"),
      JSON.stringify({ pid: 999_999, startedAt: new Date().toISOString(), command: "crash" }),
    );
    const release = acquireDataDirLock(dir);
    const lock = JSON.parse(readFileSync(path.join(dir, ".organix-instance.lock"), "utf8")) as {
      pid: number;
    };
    expect(lock.pid).toBe(process.pid);
    release();
  });
});
