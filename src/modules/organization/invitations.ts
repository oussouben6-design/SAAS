import { asMember, privileged } from "@/lib/db";
import { hashToken, generateToken } from "@/lib/auth/tokens";
import { appBaseUrl, sendMail, type MailResult } from "@/lib/mail";
import { setPasswordForUser } from "@/lib/auth/service";
import { AppError } from "@/lib/server/errors";
import { recordAudit, notify } from "@/lib/server/audit";

const INVITATION_TTL_DAYS = 7;

export interface InvitationDetails {
  token: string;
  organizationName: string;
  organizationId: string;
  email: string;
  fullName: string;
  memberId: string;
  expiresAt: string;
  requiresPassword: boolean;
}

export async function inviteMember(
  context: { userId: string; organizationId: string },
  input: {
    email: string;
    fullName: string;
    roleKeys: string[];
    departmentId: string | null;
    jobTitle: string | null;
  },
): Promise<{ mail: MailResult; invitationId: string }> {
  const email = input.email.trim().toLowerCase();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

  // 1. Garantit l'existence du profil (opération privilégiée, hors transaction métier).
  const profile = await privileged(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      "select id from profiles where lower(email) = $1",
      [email],
    );
    if (existing[0]) return { userId: existing[0].id };
    const inserted = await tx.query<{ id: string }>(
      `insert into profiles (email, full_name, is_active)
       values ($1, $2, false) returning id`,
      [email, input.fullName.trim()],
    );
    return { userId: inserted[0]!.id };
  });

  // 2. Crée ou réactualise l'invitation dans l'organisation (RLS + permissions).
  const result = await asMember(context, async (tx) => {
    const existingMembership = await tx.query<{ id: string; status: string }>(
      `select m.id, m.status from organization_members m
       where m.organization_id = $1 and m.user_id = $2`,
      [context.organizationId, profile.userId],
    );
    if (existingMembership[0]?.status === "active") {
      throw new AppError("conflict", "Cette personne est déjà membre de l'organisation.");
    }

    let memberId = existingMembership[0]?.id;

    if (memberId) {
      await tx.query(
        `update organization_members set
           status = 'invited', invitation_token_hash = $2, invitation_expires_at = $3,
           invited_by = $4, job_title = $5, department_id = $6, invited_email = $7
         where id = $1`,
        [memberId, tokenHash, expiresAt, context.userId, input.jobTitle, input.departmentId, email],
      );
    } else {
      const inserted = await tx.query<{ id: string }>(
        `insert into organization_members
          (organization_id, user_id, status, invited_email, invited_by, invitation_token_hash,
           invitation_expires_at, job_title, department_id)
         values ($1, $2, 'invited', $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          context.organizationId,
          profile.userId,
          email,
          context.userId,
          tokenHash,
          expiresAt,
          input.jobTitle,
          input.departmentId,
        ],
      );
      memberId = inserted[0]!.id;
    }

    await tx.query("delete from member_roles where member_id = $1", [memberId]);
    if (input.roleKeys.length > 0) {
      await tx.query(
        `insert into member_roles (member_id, role_id)
         select $1, r.id from roles r where r.organization_id = $2 and r.key = any($3::text[])`,
        [memberId, context.organizationId, input.roleKeys],
      );
    }

    await recordAudit(tx, {
      organizationId: context.organizationId,
      actorId: context.userId,
      action: "member.invite",
      entityType: "member",
      entityId: memberId,
      summary: `Invitation envoyée à ${email}`,
      metadata: { roleKeys: input.roleKeys },
    });

    const organization = await tx.query<{ name: string }>(
      "select name from organizations where id = $1",
      [context.organizationId],
    );
    const inviter = await tx.query<{ full_name: string }>(
      "select full_name from profiles where id = $1",
      [context.userId],
    );

    return {
      invitationId: memberId,
      organizationName: organization[0]?.name ?? "l'organisation",
      inviterName: inviter[0]?.full_name ?? "Un administrateur",
    };
  });

  // 3. Envoi de l'e-mail hors transaction (jamais de dépendance réseau dans une transaction SQL).
  const mail = await sendMail({
    to: email,
    kind: "invitation",
    subject: `ORGANIX — Invitation à rejoindre ${result.organizationName}`,
    actionUrl: `${appBaseUrl()}/invitations/${token}`,
    lines: [
      `Bonjour ${input.fullName},`,
      `${result.inviterName} vous invite à rejoindre « ${result.organizationName} » sur ORGANIX.`,
    ],
  });

  return { mail, invitationId: result.invitationId };
}

interface InvitationRow {
  member_id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  full_name: string;
  expires_at: string;
  status: string;
  has_credentials: boolean;
  profile_active: boolean;
}

async function loadInvitation(token: string): Promise<InvitationRow | null> {
  return privileged(async (tx) => {
    const rows = await tx.query<InvitationRow>(
      `select m.id as member_id, m.organization_id, o.name as organization_name,
              p.email, p.full_name, m.invitation_expires_at as expires_at, m.status,
              (c.user_id is not null) as has_credentials, p.is_active as profile_active
       from organization_members m
       join organizations o on o.id = m.organization_id
       join profiles p on p.id = m.user_id
       left join user_credentials c on c.user_id = p.id
       where m.invitation_token_hash = $1
         and m.status = 'invited'
         and m.invitation_expires_at > now()`,
      [hashToken(token)],
    );
    return rows[0] ?? null;
  });
}

export async function getInvitation(token: string): Promise<InvitationDetails | null> {
  const row = await loadInvitation(token);
  if (!row) return null;
  return {
    token,
    organizationName: row.organization_name,
    organizationId: row.organization_id,
    email: row.email,
    fullName: row.full_name,
    memberId: row.member_id,
    expiresAt: row.expires_at,
    requiresPassword: !row.has_credentials || !row.profile_active,
  };
}

export async function acceptInvitation(
  token: string,
  input: { fullName: string; password: string },
): Promise<{ userId: string; organizationId: string; email: string }> {
  const row = await loadInvitation(token);
  if (!row) {
    throw new AppError(
      "invalid_token",
      "Cette invitation est invalide ou a expiré. Demandez une nouvelle invitation.",
    );
  }
  if (row.has_credentials && row.profile_active) {
    throw new AppError(
      "conflict",
      "Un compte actif existe déjà pour cette adresse. Connectez-vous pour rejoindre l'organisation.",
    );
  }

  const userId = await privileged(async (tx) => {
    const profiles = await tx.query<{ id: string }>(
      "select id from profiles where lower(email) = $1",
      [row.email],
    );
    const profileId = profiles[0]!.id;

    await tx.query(
      "update profiles set full_name = $2, is_active = true, email_verified_at = coalesce(email_verified_at, now()) where id = $1",
      [profileId, input.fullName.trim()],
    );
    await tx.query(
      `update organization_members
       set status = 'active', joined_at = now(), invitation_token_hash = null, invitation_expires_at = null
       where id = $1`,
      [row.member_id],
    );
    await recordAudit(tx, {
      organizationId: row.organization_id,
      actorId: profileId,
      action: "member.invitation.accept",
      entityType: "member",
      entityId: row.member_id,
      summary: `Invitation acceptée par ${row.email}`,
    });
    const inviter = await tx.query<{ invited_by: string | null }>(
      "select invited_by from organization_members where id = $1",
      [row.member_id],
    );
    if (inviter[0]?.invited_by) {
      await notify(tx, {
        organizationId: row.organization_id,
        userId: inviter[0].invited_by,
        title: "Invitation acceptée",
        body: `${input.fullName} a rejoint l'organisation.`,
        type: "success",
        link: "/app/parametres/equipe",
      });
    }
    return profileId;
  });

  await setPasswordForUser(userId, input.password);
  return { userId, organizationId: row.organization_id, email: row.email };
}
