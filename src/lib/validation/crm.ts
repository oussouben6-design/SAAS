import { z } from "zod";
import {
  dateTimeLocal,
  optionalEmail,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from "./common";

export const customerSchema = z.object({
  id: optionalUuid,
  name: requiredText("Nom du client", 2, 160),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalText(200),
  address: optionalText(240),
  city: optionalText(80),
  country: optionalText(80),
  taxId: optionalText(60),
  categoryId: optionalUuid,
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  notes: optionalText(5000),
});

export const contactSchema = z.object({
  customerId: uuidSchema,
  fullName: requiredText("Nom du contact", 2, 120),
  roleTitle: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  isPrimary: z.preprocess((value) => value === "on" || value === "true", z.boolean()).default(false),
});

export const interactionSchema = z.object({
  customerId: uuidSchema,
  type: z.enum(["note", "call", "email", "meeting", "visit", "other"]).default("note"),
  subject: requiredText("Objet", 2, 160),
  notes: optionalText(4000),
  occurredAt: dateTimeLocal,
});

export const categorySchema = z.object({
  name: requiredText("Nom de la catégorie", 2, 60),
  color: z.enum(["slate", "blue", "emerald", "amber", "rose", "violet"]).default("slate"),
});

export const leadSchema = z.object({
  id: optionalUuid,
  name: requiredText("Nom du prospect", 2, 160),
  company: optionalText(160),
  email: optionalEmail,
  phone: optionalText(40),
  source: z
    .enum(["direct", "referral", "website", "social", "event", "call", "other"])
    .default("direct"),
  status: z.enum(["new", "contacted", "qualified", "unqualified"]).default("new"),
  notes: optionalText(4000),
  nextFollowUpAt: optionalText(30),
  ownerId: optionalUuid,
});

export const opportunitySchema = z.object({
  name: requiredText("Nom de l'opportunité", 2, 160),
  customerId: optionalUuid,
  stageId: uuidSchema,
  amountMinor: z.coerce.number().int().min(0, "Montant invalide"),
  probability: z.coerce.number().int().min(0).max(100),
  expectedCloseDate: optionalText(10),
  ownerId: optionalUuid,
  notes: optionalText(4000),
});
