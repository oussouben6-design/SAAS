import { z } from "zod";
import { emailSchema, optionalText, passwordSchema, requiredText } from "./common";

export const signUpSchema = z
  .object({
    fullName: requiredText("Nom complet", 2, 120),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas",
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis"),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "Jeton invalide"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mot de passe actuel requis"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas",
  });

/** Premier mot de passe d'un compte créé via Google (aucun mot de passe actuel à confirmer). */
export const setInitialPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Les mots de passe ne correspondent pas",
  });

export const profileSchema = z.object({
  fullName: requiredText("Nom complet", 2, 120),
  phone: optionalText(40),
  jobTitle: optionalText(120),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  fullName: requiredText("Nom complet", 2, 120),
  roleKeys: z.array(z.string()).min(1, "Sélectionnez au moins un rôle"),
  departmentId: z
    .union([z.literal(""), z.string().uuid()])
    .optional()
    .transform((value) => (value ? value : null)),
  jobTitle: optionalText(120),
});
