import { ZodError } from "zod";
import { AppError } from "./errors";
import { fieldErrors } from "@/lib/validation/common";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string>; code?: string; data?: T };

/**
 * Enveloppe commune des Server Actions : convertit les erreurs métier en résultat typé
 * sans jamais exposer de détail interne (stack, SQL, secrets) au navigateur.
 */
export async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        ok: false,
        code: "validation",
        message: "Certains champs sont invalides.",
        fieldErrors: fieldErrors(error),
      };
    }
    if (error instanceof AppError) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    // Les redirections Next.js utilisent des exceptions spéciales : on les propage.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[excellence360:action]", error);
    return {
      ok: false,
      code: "internal",
      message: "Une erreur inattendue est survenue. L'opération n'a pas été enregistrée.",
    };
  }
}

export function success<T>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

export function failure(message: string, code?: string, errors?: Record<string, string>): ActionResult<never> {
  return { ok: false, message, code, fieldErrors: errors };
}
