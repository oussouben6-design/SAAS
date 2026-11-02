import { z } from "zod";
import {
  isoDate,
  optionalIsoDate,
  optionalText,
  optionalUuid,
  percentSchema,
  requiredText,
  uuidSchema,
} from "./common";

/** Montant saisi au format « 1 250 000,50 » : converti en unité mineure par la Server Action. */
export const moneyInput = z
  .string()
  .trim()
  .min(1, "Montant requis")
  .max(24, "Montant trop long")
  .regex(/^[0-9\s.,-]+$/, "Montant invalide (chiffres, espaces, virgule ou point)");

export const PAYMENT_METHODS = [
  "cash",
  "transfer",
  "card",
  "mobile_money",
  "cheque",
  "other",
] as const;

export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: "Espèces",
  transfer: "Virement",
  card: "Carte",
  mobile_money: "Mobile money",
  cheque: "Chèque",
  other: "Autre",
};

export const INVOICE_STATUSES = ["draft", "sent", "partial", "paid", "overdue", "cancelled"] as const;

export const INVOICE_STATUS_LABELS: Record<(typeof INVOICE_STATUSES)[number], string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  partial: "Partiellement payée",
  paid: "Payée",
  overdue: "En retard",
  cancelled: "Annulée",
};

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

export const QUOTE_STATUS_LABELS: Record<(typeof QUOTE_STATUSES)[number], string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  rejected: "Refusé",
  expired: "Expiré",
};

export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;

export const EXPENSE_STATUS_LABELS: Record<(typeof EXPENSE_STATUSES)[number], string> = {
  pending: "En attente",
  approved: "Validée",
  rejected: "Refusée",
};

export const CATEGORY_KINDS = ["income", "expense"] as const;

export const invoiceSchema = z.object({
  customerId: uuidSchema,
  projectId: optionalUuid,
  issueDate: isoDate,
  dueDate: optionalIsoDate,
  taxRate: z.preprocess((value) => (value === "" || value === undefined ? 0 : value), percentSchema),
  notes: optionalText(2000),
  terms: optionalText(2000),
  lineDescription: requiredText("Désignation", 1, 300),
  quantity: z.coerce.number().positive("Quantité invalide").max(1_000_000),
  unitPrice: moneyInput,
});

export const invoiceMetaSchema = z.object({
  id: uuidSchema,
  customerId: uuidSchema,
  projectId: optionalUuid,
  issueDate: isoDate,
  dueDate: optionalIsoDate,
  taxRate: z.preprocess((value) => (value === "" || value === undefined ? 0 : value), percentSchema),
  notes: optionalText(2000),
  terms: optionalText(2000),
});

export const invoiceItemSchema = z.object({
  invoiceId: uuidSchema,
  description: requiredText("Désignation", 1, 300),
  quantity: z.coerce.number().positive("Quantité invalide").max(1_000_000),
  unitPrice: moneyInput,
});

export const invoiceStatusSchema = z.object({
  id: uuidSchema,
  status: z.enum(INVOICE_STATUSES),
});

export const paymentSchema = z.object({
  invoiceId: uuidSchema,
  amount: moneyInput,
  paidAt: isoDate,
  method: z.enum(PAYMENT_METHODS).default("transfer"),
  reference: optionalText(120),
  notes: optionalText(500),
});

export const quoteSchema = z.object({
  customerId: optionalUuid,
  subject: requiredText("Objet du devis", 2, 200),
  issueDate: isoDate,
  validUntil: optionalIsoDate,
  taxRate: z.preprocess((value) => (value === "" || value === undefined ? 0 : value), percentSchema),
  notes: optionalText(2000),
  terms: optionalText(2000),
  lineDescription: requiredText("Désignation", 1, 300),
  quantity: z.coerce.number().positive("Quantité invalide").max(1_000_000),
  unitPrice: moneyInput,
});

export const quoteItemSchema = z.object({
  quoteId: uuidSchema,
  description: requiredText("Désignation", 1, 300),
  quantity: z.coerce.number().positive("Quantité invalide").max(1_000_000),
  unitPrice: moneyInput,
});

export const quoteStatusSchema = z.object({
  id: uuidSchema,
  status: z.enum(QUOTE_STATUSES),
});

export const expenseSchema = z.object({
  categoryId: optionalUuid,
  label: requiredText("Libellé", 2, 200),
  amount: moneyInput,
  expenseDate: isoDate,
  projectId: optionalUuid,
  departmentId: optionalUuid,
  supplier: optionalText(160),
  method: z.enum(PAYMENT_METHODS).default("transfer"),
  reference: optionalText(120),
  notes: optionalText(1000),
});

export const expenseDecisionSchema = z.object({
  id: uuidSchema,
  decision: z.enum(["approved", "rejected"]),
  comment: optionalText(500),
});

export const revenueSchema = z.object({
  categoryId: optionalUuid,
  label: requiredText("Libellé", 2, 200),
  amount: moneyInput,
  receivedAt: isoDate,
  method: z.enum(PAYMENT_METHODS).default("transfer"),
  reference: optionalText(120),
  notes: optionalText(1000),
});

export const financialCategorySchema = z.object({
  kind: z.enum(CATEGORY_KINDS),
  name: requiredText("Nom de la catégorie", 2, 80),
});
