import { z } from "zod";
import {
  optionalEmail,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from "./common";

export const CURRENCIES = ["XOF", "XAF", "EUR", "USD", "GBP", "MAD", "GHS", "NGN"] as const;
export const TIMEZONES = [
  "Africa/Niamey",
  "Africa/Abidjan",
  "Africa/Dakar",
  "Africa/Lagos",
  "Africa/Douala",
  "Africa/Casablanca",
  "Europe/Paris",
  "UTC",
] as const;

export const createOrganizationSchema = z.object({
  name: requiredText("Nom de l'organisation", 2, 120),
  industry: optionalText(120),
  country: optionalText(80),
  city: optionalText(80),
  currency: z.enum(CURRENCIES).default("XOF"),
  timezone: z.enum(TIMEZONES).default("Africa/Niamey"),
  language: z.enum(["fr", "en"]).default("fr"),
});

export const organizationSettingsSchema = z.object({
  name: requiredText("Nom de l'organisation", 2, 120),
  legalName: optionalText(160),
  industry: optionalText(120),
  description: optionalText(2000),
  address: optionalText(240),
  city: optionalText(80),
  country: optionalText(80),
  phone: optionalText(40),
  email: optionalEmail,
  website: optionalText(200),
  currency: z.enum(CURRENCIES),
  timezone: z.enum(TIMEZONES),
  language: z.enum(["fr", "en"]),
});

export const departmentSchema = z.object({
  name: requiredText("Nom du département", 2, 120),
  code: optionalText(20),
  description: optionalText(500),
  managerId: optionalUuid,
});

export const updateMemberSchema = z.object({
  memberId: uuidSchema,
  jobTitle: optionalText(120),
  departmentId: optionalUuid,
  roleKeys: z.array(z.string()).min(1, "Sélectionnez au moins un rôle"),
});

export const toggleModuleSchema = z.object({
  moduleKey: z.string().min(2),
  enabled: z.boolean(),
});
