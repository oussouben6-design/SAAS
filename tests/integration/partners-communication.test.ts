import { describe, expect, it } from "vitest";
import { addMemberWithRole, createTestActor, contextOf } from "../helpers";
import {
  addAgreement,
  addPartnerContact,
  createPartner,
  deleteAgreement,
  deletePartner,
  deletePartnerContact,
  getPartner,
  listPartners,
  updatePartner,
} from "@/modules/partners/service";
import {
  createAnnouncement,
  createEvent,
  deleteAnnouncement,
  listAnnouncements,
  listEvents,
} from "@/modules/communication/service";
import { privileged } from "@/lib/db";

const basePartner = {
  name: "Coopérative Sahel",
  type: "supplier",
  email: "contact@sahel.test",
  phone: null,
  website: null,
  address: null,
  city: "Niamey",
  country: "Niger",
  contactPerson: "M. Ibrahim",
  status: "active",
  notes: null,
};

describe("partenaires", () => {
  it("crée, met à jour, archive et liste les partenaires", async () => {
    const actor = await createTestActor({ name: "Responsable partenariats" });
    const ctx = contextOf(actor);

    const partnerId = await createPartner(ctx, basePartner);
    let detail = await getPartner(ctx, partnerId);
    expect(detail.partner.name).toBe("Coopérative Sahel");
    expect(detail.contacts).toHaveLength(0);
    expect(detail.agreements).toHaveLength(0);

    await updatePartner(ctx, { id: partnerId, ...basePartner, name: "Coopérative Sahel Unie", status: "inactive" });
    detail = await getPartner(ctx, partnerId);
    expect(detail.partner.name).toBe("Coopérative Sahel Unie");
    expect(detail.partner.status).toBe("inactive");

    const list = await listPartners(ctx, { status: "inactive", pageSize: 10 });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.name).toBe("Coopérative Sahel Unie");

    await deletePartner(ctx, partnerId);
    const active = await listPartners(ctx, { pageSize: 10 });
    expect(active.items).toHaveLength(0);
    await expect(getPartner(ctx, partnerId)).rejects.toThrow(/introuvable/i);

    // L'archivage est logique : la ligne reste présente en base.
    const row = await privileged((tx) =>
      tx.query<{ deleted_at: string | null }>("select deleted_at from partners where id = $1", [partnerId]),
    );
    expect(row[0]?.deleted_at).not.toBeNull();
  });

  it("gère les contacts, le contact principal unique et les conventions", async () => {
    const actor = await createTestActor({ name: "Chargé de partenariat" });
    const ctx = contextOf(actor);
    const partnerId = await createPartner(ctx, basePartner);

    await addPartnerContact(ctx, {
      partnerId,
      fullName: "Aïcha Maïga",
      roleTitle: "Directrice",
      email: "aicha@sahel.test",
      phone: null,
      isPrimary: true,
    });
    await addPartnerContact(ctx, {
      partnerId,
      fullName: "Moussa Kimba",
      roleTitle: "Comptable",
      email: null,
      phone: "+22790000001",
      isPrimary: true,
    });

    const detail = await getPartner(ctx, partnerId);
    expect(detail.contacts).toHaveLength(2);
    const primaries = detail.contacts.filter((contact) => contact.is_primary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.full_name).toBe("Moussa Kimba");

    await deletePartnerContact(ctx, { partnerId, contactId: detail.contacts[0]!.id });
    expect((await getPartner(ctx, partnerId)).contacts).toHaveLength(1);

    await expect(
      addAgreement(ctx, {
        partnerId,
        title: "Convention invalide",
        reference: null,
        startDate: "2026-06-01",
        endDate: "2026-05-01",
        status: "active",
        notes: null,
      }),
    ).rejects.toThrow(/fin/i);

    await addAgreement(ctx, {
      partnerId,
      title: "Convention de fourniture",
      reference: "CONV-2026-01",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      status: "active",
      notes: null,
    });
    const withAgreement = await getPartner(ctx, partnerId);
    expect(withAgreement.agreements).toHaveLength(1);
    expect(withAgreement.agreements[0]?.title).toBe("Convention de fourniture");

    await deleteAgreement(ctx, { partnerId, agreementId: withAgreement.agreements[0]!.id });
    expect((await getPartner(ctx, partnerId)).agreements).toHaveLength(0);
  });
});

describe("communication : annonces et calendrier", () => {
  it("publie une annonce, la conserve en tête et l'archive", async () => {
    const actor = await createTestActor({ name: "Communicant" });
    const ctx = contextOf(actor);

    await createAnnouncement(ctx, {
      title: "Assemblée générale",
      body: "Réunion de toute l'équipe vendredi à 10h.",
      audience: "all",
      departmentId: null,
      isPinned: true,
      expiresAt: null,
    });

    let announcements = await listAnnouncements(ctx);
    expect(announcements).toHaveLength(1);
    expect(announcements[0]?.is_pinned).toBe(true);
    expect(announcements[0]?.author).toBe("Communicant");

    await deleteAnnouncement(ctx, announcements[0]!.id);
    announcements = await listAnnouncements(ctx);
    expect(announcements).toHaveLength(0);
  });

  it("ne montre les annonces ciblées qu'aux destinataires concernés", async () => {
    const actor = await createTestActor({ name: "Administrateur annonces" });
    const ctx = contextOf(actor);

    await createAnnouncement(ctx, {
      title: "Annonce pour tous",
      body: "Visible par tous les membres.",
      audience: "all",
      departmentId: null,
      isPinned: false,
      expiresAt: null,
    });
    await createAnnouncement(ctx, {
      title: "Annonce réservée aux administrateurs",
      body: "Contenu réservé.",
      audience: "admins",
      departmentId: null,
      isPinned: false,
      expiresAt: null,
    });

    const adminView = await listAnnouncements(ctx);
    expect(adminView.map((item) => item.title)).toContain("Annonce pour tous");
    expect(adminView.map((item) => item.title)).toContain("Annonce réservée aux administrateurs");

    const employee = await addMemberWithRole(actor.organizationId, "employee");
    const employeeView = await listAnnouncements({
      userId: employee.userId,
      organizationId: actor.organizationId,
    });
    expect(employeeView.map((item) => item.title)).toEqual(["Annonce pour tous"]);
  });

  it("refuse une audience départementale sans département et valide les dates", async () => {
    const actor = await createTestActor({ name: "Communicant 2" });
    const ctx = contextOf(actor);

    await expect(
      createAnnouncement(ctx, {
        title: "Annonce ciblée",
        body: "Contenu",
        audience: "department",
        departmentId: null,
        isPinned: false,
        expiresAt: null,
      }),
    ).rejects.toThrow(/département/i);

    await expect(
      createEvent(ctx, {
        title: "Réunion",
        description: null,
        startsAt: "2026-10-10T10:00",
        endsAt: "2026-10-10T09:00",
        allDay: false,
        location: "Salle 1",
        visibility: "organization",
        departmentId: null,
        projectId: null,
      }),
    ).rejects.toThrow(/précède/i);

    await createEvent(ctx, {
      title: "Réunion de lancement",
      description: "Ordre du jour disponible sur le drive.",
      startsAt: "2026-10-10T10:00",
      endsAt: "2026-10-10T11:30",
      allDay: false,
      location: "Salle 1",
      visibility: "organization",
      departmentId: null,
      projectId: null,
    });

    const events = await listEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Réunion de lancement");
    expect(events[0]?.location).toBe("Salle 1");
  });
});
