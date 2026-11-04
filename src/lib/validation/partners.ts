import { z } from "zod";
import {
  isoDate,
  optionalEmail,
  optionalIsoDate,
  optionalText,
  optionalUuid,
  requiredText,
  uuidSchema,
} from "./common";

export const PARTNER_TYPES = ["supplier", "institution", "distributor", "ngo", "other"] as const;

export const PARTNER_TYPE_LABELS: Record<(typeof PARTNER_TYPES)[number], string> = {
  supplier: "Fournisseur",
  institution: "Institution",
  distributor: "Distributeur",
  ngo: "ONG",
  other: "Autre",
};

export const PARTNER_STATUSES = ["active", "inactive", "archived"] as const;

export const PARTNER_STATUS_LABELS: Record<(typeof PARTNER_STATUSES)[number], string> = {
  active: "Actif",
  inactive: "Inactif",
  archived: "Archivé",
};

export const AGREEMENT_STATUSES = ["draft", "active", "expired", "terminated"] as const;

export const AGREEMENT_STATUS_LABELS: Record<(typeof AGREEMENT_STATUSES)[number], string> = {
  draft: "Brouillon",
  active: "En cours",
  expired: "Expiré",
  terminated: "Résilié",
};

export const partnerSchema = z.object({
  id: optionalUuid,
  name: requiredText("Nom du partenaire", 2, 160),
  type: z.enum(PARTNER_TYPES).default("supplier"),
  email: optionalEmail,
  phone: optionalText(40),
  website: optionalText(200),
  address: optionalText(300),
  city: optionalText(120),
  country: optionalText(120),
  contactPerson: optionalText(120),
  status: z.enum(PARTNER_STATUSES).default("active"),
  notes: optionalText(2000),
});

export const partnerContactSchema = z.object({
  partnerId: uuidSchema,
  fullName: requiredText("Nom du contact", 2, 120),
  roleTitle: optionalText(120),
  email: optionalEmail,
  phone: optionalText(40),
  isPrimary: z.preprocess((value) => value === "on" || value === "true", z.boolean()).default(false),
});

export const agreementSchema = z.object({
  partnerId: uuidSchema,
  title: requiredText("Titre de la convention", 2, 200),
  reference: optionalText(60),
  startDate: optionalIsoDate,
  endDate: optionalIsoDate,
  status: z.enum(AGREEMENT_STATUSES).default("draft"),
  notes: optionalText(1000),
});

export { isoDate };
