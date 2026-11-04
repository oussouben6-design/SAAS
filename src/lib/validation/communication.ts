import { z } from "zod";
import { dateTimeLocal, optionalIsoDate, optionalText, optionalUuid, requiredText, uuidSchema } from "./common";

export const ANNOUNCEMENT_AUDIENCES = ["all", "department", "admins"] as const;

export const ANNOUNCEMENT_AUDIENCE_LABELS: Record<(typeof ANNOUNCEMENT_AUDIENCES)[number], string> = {
  all: "Toute l'organisation",
  department: "Un département",
  admins: "Administrateurs uniquement",
};

export const announcementSchema = z.object({
  id: optionalUuid,
  title: requiredText("Titre de l'annonce", 2, 200),
  body: requiredText("Contenu", 2, 5000),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES).default("all"),
  departmentId: optionalUuid,
  isPinned: z.preprocess((value) => value === "on" || value === "true", z.boolean()).default(false),
  expiresAt: optionalIsoDate,
});

export const eventVisibility = z.enum(["organization", "department", "private"]).default("organization");

export const eventSchema = z.object({
  title: requiredText("Titre de l'événement", 2, 200),
  description: optionalText(2000),
  startsAt: dateTimeLocal,
  endsAt: z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? null : value),
    z
      .string()
      .min(10, "Date et heure requises")
      .refine((value) => !Number.isNaN(Date.parse(value)), "Date et heure invalides")
      .nullable(),
  ),
  allDay: z.preprocess((value) => value === "on" || value === "true", z.boolean()).default(false),
  location: optionalText(200),
  visibility: eventVisibility,
  departmentId: optionalUuid,
  projectId: optionalUuid,
});

export { uuidSchema };
