import { z } from "zod";

export const uuidSchema = z.string().uuid("Identifiant invalide");

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Adresse e-mail requise")
  .max(200, "Adresse e-mail trop longue")
  .email("Adresse e-mail invalide")
  .transform((value) => value.toLowerCase());

/** Politique de mot de passe : 10 caractères minimum, une lettre et un chiffre. */
export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères")
  .max(200, "Le mot de passe ne peut pas dépasser 200 caractères")
  .regex(/[A-Za-z]/, "Le mot de passe doit contenir au moins une lettre")
  .regex(/[0-9]/, "Le mot de passe doit contenir au moins un chiffre");

export const requiredText = (label: string, min = 1, max = 200) =>
  z
    .string()
    .trim()
    .min(min, `${label} : ${min} caractères minimum`)
    .max(max, `${label} : ${max} caractères maximum`);

const blankToEmpty = (value: unknown) => (value === undefined || value === null ? "" : value);

export const optionalText = (max = 2000) =>
  z.preprocess(blankToEmpty, z.string().trim().max(max, `${max} caractères maximum`)).transform(
    (value) => (value.length > 0 ? value : null),
  );

export const optionalEmail = z
  .preprocess(blankToEmpty, z.union([z.literal(""), z.string().trim().email("Adresse e-mail invalide")]))
  .transform((value) => (value.length > 0 ? value.toLowerCase() : null));

export const optionalUuid = z
  .preprocess(blankToEmpty, z.union([z.literal(""), z.string().uuid("Identifiant invalide")]))
  .transform((value) => (value.length > 0 ? value : null));

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Date invalide");

export const optionalIsoDate = z
  .preprocess(
    blankToEmpty,
    z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ")]),
  )
  .transform((value) => (value.length > 0 ? value : null));

export const dateTimeLocal = z
  .string()
  .min(10, "Date et heure requises")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Date et heure invalides");

/** Montants en unité mineure (entier) : jamais de flottant en base. */
export const moneyMinor = z.coerce
  .number({ invalid_type_error: "Montant invalide" })
  .int("Le montant doit être un entier")
  .min(0, "Le montant ne peut pas être négatif")
  .max(9_000_000_000_000, "Montant trop élevé");

export const percentSchema = z.coerce.number().int().min(0).max(100);

export const quantitySchema = z.coerce
  .number({ invalid_type_error: "Quantité invalide" })
  .positive("La quantité doit être supérieure à zéro")
  .max(1_000_000);

export const sortDirection = z.enum(["asc", "desc"]).default("desc");

export type ZonedField = { path: (string | number)[]; message: string };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
