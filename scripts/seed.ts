/**
 * Crée un jeu de données de DÉMONSTRATION, clairement identifié.
 *
 * - L'organisation créée porte `is_demo = true` : un bandeau permanent s'affiche dans
 *   l'application et aucun export ne la présente comme réelle.
 * - Les identifiants de connexion sont affichés à la fin de l'exécution ; le mot de passe
 *   est généré aléatoirement (ou fourni via `ORGANIX_SEED_PASSWORD`).
 * - Le script refuse de s'exécuter sur une base distante sauf autorisation explicite.
 *
 * Usage : npm run db:seed            (refuse si la démo existe déjà)
 *         npm run db:seed -- --force (supprime UNIQUEMENT l'organisation de démonstration)
 */
import { randomBytes } from "node:crypto";
import { closeDb, privileged } from "../src/lib/db";
import type { SqlExecutor } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { saveFile, buildStoragePath, checksum } from "../src/lib/storage";
import { createOrganization } from "../src/modules/organization/service";
import { DEFAULT_ROLES, type RoleKey } from "../src/lib/permissions/default-roles";

const DEMO_SLUG = "organix-demo";
const CURRENCY = "XOF";
const FORCE = process.argv.includes("--force");

interface DemoUser {
  email: string;
  fullName: string;
  role: RoleKey;
  jobTitle: string;
  department: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: "demo.admin@organix.local",
    fullName: "Amina Traoré",
    role: "owner",
    jobTitle: "Directrice générale",
    department: "Direction",
  },
  {
    email: "demo.directeur@organix.local",
    fullName: "Moussa Diallo",
    role: "director",
    jobTitle: "Directeur des opérations",
    department: "Opérations",
  },
  {
    email: "demo.responsable@organix.local",
    fullName: "Fatou Bello",
    role: "department_manager",
    jobTitle: "Responsable commerciale",
    department: "Commercial",
  },
  {
    email: "demo.gestionnaire@organix.local",
    fullName: "Ibrahim Sani",
    role: "manager",
    jobTitle: "Chef de projet",
    department: "Opérations",
  },
  {
    email: "demo.employe@organix.local",
    fullName: "Aïcha Kouassi",
    role: "employee",
    jobTitle: "Chargée de clientèle",
    department: "Commercial",
  },
  {
    email: "demo.lecteur@organix.local",
    fullName: "Salif Oumarou",
    role: "reader",
    jobTitle: "Contrôleur externe",
    department: "Finance",
  },
];

const DEPARTMENTS = [
  { name: "Direction", code: "DIR", description: "Pilotage et stratégie" },
  { name: "Commercial", code: "COM", description: "Ventes et relation client" },
  { name: "Opérations", code: "OPS", description: "Exécution des projets" },
  { name: "Finance", code: "FIN", description: "Budget, facturation et contrôle" },
];

/** Convertit un montant lisible (ex. 1 250 000 XOF) en unité mineure entière. */
function money(amount: number): number {
  return Math.round(amount);
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

async function seedPassword(): Promise<string> {
  const provided = process.env.ORGANIX_SEED_PASSWORD;
  if (provided && provided.length >= 12) return provided;
  if (provided) {
    console.warn("[seed] ORGANIX_SEED_PASSWORD ignoré (12 caractères minimum).");
  }
  return `Demo-${randomBytes(9).toString("base64url")}`;
}

async function upsertProfile(
  tx: SqlExecutor,
  user: DemoUser,
  emailVerified: boolean,
): Promise<string> {
  const existing = await tx.query<{ id: string }>(
    "select id from profiles where lower(email) = lower($1)",
    [user.email],
  );
  if (existing.length > 0) return existing[0]!.id;
  const rows = await tx.query<{ id: string }>(
    `insert into profiles (email, full_name, job_title, email_verified_at)
     values ($1, $2, $3, $4) returning id`,
    [user.email, user.fullName, user.jobTitle, emailVerified ? new Date().toISOString() : null],
  );
  return rows[0]!.id;
}

async function writeCredentials(tx: SqlExecutor, userId: string, password: string): Promise<void> {
  const { hash, salt, algorithm } = await hashPassword(password);
  await tx.query(
    `insert into user_credentials (user_id, password_hash, password_salt, algorithm, password_updated_at)
     values ($1, $2, $3, $4, now())
     on conflict (user_id) do update
       set password_hash = excluded.password_hash,
           password_salt = excluded.password_salt,
           algorithm = excluded.algorithm,
           password_updated_at = now()`,
    [userId, hash, salt, algorithm],
  );
}

async function deleteDemoOrganization(tx: SqlExecutor): Promise<number> {
  const rows = await tx.query<{ id: string; name: string }>(
    "select id, name from organizations where is_demo = true",
  );
  if (rows.length === 0) return 0;
  // Garde-fou : jamais de suppression d'une organisation réelle, même avec --force.
  await tx.query("delete from organizations where is_demo = true");
  return rows.length;
}

async function addMember(
  tx: SqlExecutor,
  organizationId: string,
  userId: string,
  roleKey: RoleKey,
  departmentId: string | null,
  jobTitle: string,
): Promise<string> {
  const rows = await tx.query<{ id: string }>(
    `insert into organization_members (organization_id, user_id, department_id, job_title, status, is_owner, joined_at)
     values ($1, $2, $3, $4, 'active', $5, now())
     on conflict (organization_id, user_id) do update set job_title = excluded.job_title
     returning id`,
    [organizationId, userId, departmentId, jobTitle, roleKey === "owner"],
  );
  const memberId = rows[0]!.id;
  await tx.query(
    `insert into member_roles (member_id, role_id)
     select $1, r.id from roles r where r.organization_id = $2 and r.key = $3
     on conflict do nothing`,
    [memberId, organizationId, roleKey],
  );
  return memberId;
}

async function seedCrm(
  tx: SqlExecutor,
  orgId: string,
  actorId: string,
  users: Record<RoleKey, string>,
) {
  const categories = [
    { name: "Entreprise", color: "indigo" },
    { name: "Institution publique", color: "sky" },
    { name: "ONG", color: "emerald" },
  ];
  const categoryIds: Record<string, string> = {};
  for (const category of categories) {
    const rows = await tx.query<{ id: string }>(
      `insert into customer_categories (organization_id, name, color) values ($1, $2, $3)
       returning id`,
      [orgId, category.name, category.color],
    );
    categoryIds[category.name] = rows[0]!.id;
  }

  const customers = [
    {
      name: "Sahel Distribution SA",
      category: "Entreprise",
      email: "contact@sahel-distribution.example",
      phone: "+227 90 00 00 01",
      city: "Niamey",
      country: "Niger",
      status: "active",
      owner: users.manager,
    },
    {
      name: "Ministère de l'Éducation (exemple)",
      category: "Institution publique",
      email: "contact@education.example",
      phone: "+227 90 00 00 02",
      city: "Niamey",
      country: "Niger",
      status: "active",
      owner: users.department_manager,
    },
    {
      name: "ONG Horizon Sahel",
      category: "ONG",
      email: "contact@horizon-sahel.example",
      phone: "+227 90 00 00 03",
      city: "Maradi",
      country: "Niger",
      status: "active",
      owner: users.director,
    },
    {
      name: "Coopérative Agricole de Tillabéri",
      category: "Entreprise",
      email: "contact@coop-tillaberi.example",
      phone: "+227 90 00 00 04",
      city: "Tillabéri",
      country: "Niger",
      status: "inactive",
      owner: users.employee,
    },
    {
      name: "Cabinet Conseil Avenir",
      category: "Entreprise",
      email: "contact@conseil-avenir.example",
      phone: "+227 90 00 00 05",
      city: "Niamey",
      country: "Niger",
      status: "active",
      owner: users.manager,
    },
  ];

  const customerIds: string[] = [];
  for (const customer of customers) {
    const rows = await tx.query<{ id: string }>(
      `insert into customers
        (organization_id, name, category_id, email, phone, city, country, status, owner_id, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [
        orgId,
        customer.name,
        categoryIds[customer.category]!,
        customer.email,
        customer.phone,
        customer.city,
        customer.country,
        customer.status,
        customer.owner,
        "Client fictif créé par le jeu de démonstration.",
        actorId,
      ],
    );
    const customerId = rows[0]!.id;
    customerIds.push(customerId);

    await tx.query(
      `insert into customer_contacts
        (organization_id, customer_id, full_name, email, phone, role_title, is_primary)
       values ($1, $2, $3, $4, $5, $6, true)`,
      [
        orgId,
        customerId,
        `Contact ${customer.name.split(" ")[0]}`,
        customer.email,
        customer.phone,
        "Interlocuteur principal",
      ],
    );

    await tx.query(
      `insert into customer_interactions
        (organization_id, customer_id, type, subject, notes, occurred_at, created_by)
       values ($1, $2, 'call', 'Appel de suivi', 'Échange de démonstration.', $3, $4)`,
      [orgId, customerId, isoDaysAgo(12), customer.owner],
    );
  }

  const leads = [
    { name: "Kadri Abdou", company: "Kadri Négoce", source: "referral", status: "qualified" },
    { name: "Mariam Issa", company: "Issa & Fils", source: "website", status: "contacted" },
    { name: "Boubacar Maïga", company: "Maïga Import", source: "event", status: "new" },
    { name: "Hadjara Soumana", company: "Soumana Textile", source: "call", status: "unqualified" },
    { name: "Ousmane Barry", company: "Barry Logistique", source: "direct", status: "new" },
  ];

  for (const [index, lead] of leads.entries()) {
    await tx.query(
      `insert into leads
        (organization_id, name, company, email, phone, source, status, owner_id, notes, next_follow_up_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        orgId,
        lead.name,
        lead.company,
        `lead${index + 1}@example.test`,
        "+227 90 00 00 1" + index,
        lead.source,
        lead.status,
        users.department_manager,
        "Piste fictive de démonstration.",
        isoDaysAgo(-(index + 2)),
        actorId,
      ],
    );
  }

  const stages = await tx.query<{ id: string; name: string }>(
    "select id, name from pipeline_stages where organization_id = $1 order by position",
    [orgId],
  );
  const stageId = (name: string) => stages.find((stage) => stage.name === name)?.id ?? stages[0]!.id;

  const opportunities = [
    { name: "Renouvellement parc informatique", stage: "Négociation", amount: money(4_500_000), customer: 0 },
    { name: "Fourniture de manuels scolaires", stage: "Proposition", amount: money(12_000_000), customer: 1 },
    { name: "Formation des équipes terrain", stage: "Qualification", amount: money(2_800_000), customer: 2 },
    { name: "Audit organisationnel", stage: "Gagnée", amount: money(1_750_000), customer: 4 },
    { name: "Étude de faisabilité", stage: "Perdue", amount: money(900_000), customer: 3 },
  ];

  for (const opportunity of opportunities) {
    const won = opportunity.stage === "Gagnée";
    const lost = opportunity.stage === "Perdue";
    await tx.query(
      `insert into opportunities
        (organization_id, name, customer_id, stage_id, amount_minor, currency, probability,
         expected_close_date, owner_id, status, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        orgId,
        opportunity.name,
        customerIds[opportunity.customer]!,
        stageId(opportunity.stage),
        opportunity.amount,
        CURRENCY,
        won ? 100 : lost ? 0 : 50,
        daysFromToday(30),
        users.department_manager,
        won ? "won" : lost ? "lost" : "open",
        "Opportunité fictive de démonstration.",
        actorId,
      ],
    );
  }

  return customerIds;
}

async function seedProjects(
  tx: SqlExecutor,
  orgId: string,
  actorId: string,
  users: Record<RoleKey, string>,
  customerIds: string[],
  departmentIds: Record<string, string>,
) {
  const projects = [
    {
      name: "Déploiement du système de gestion",
      code: "PRJ-001",
      status: "active",
      priority: "high",
      progress: 45,
      budget: money(8_500_000),
      customer: 0,
      department: "Opérations",
      manager: users.manager,
      start: daysFromToday(-40),
      end: daysFromToday(50),
    },
    {
      name: "Campagne de sensibilisation 2026",
      code: "PRJ-002",
      status: "planning",
      priority: "medium",
      progress: 10,
      budget: money(3_200_000),
      customer: 2,
      department: "Commercial",
      manager: users.department_manager,
      start: daysFromToday(-5),
      end: daysFromToday(90),
    },
    {
      name: "Refonte du site institutionnel",
      code: "PRJ-003",
      status: "completed",
      priority: "medium",
      progress: 100,
      budget: money(2_100_000),
      customer: 4,
      department: "Opérations",
      manager: users.director,
      start: daysFromToday(-120),
      end: daysFromToday(-10),
    },
  ];

  const projectIds: string[] = [];
  for (const project of projects) {
    const rows = await tx.query<{ id: string }>(
      `insert into projects
        (organization_id, name, code, description, customer_id, department_id, manager_id, status,
         priority, start_date, end_date, budget_minor, currency, progress, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       returning id`,
      [
        orgId,
        project.name,
        project.code,
        "Projet fictif du jeu de démonstration.",
        customerIds[project.customer]!,
        departmentIds[project.department]!,
        project.manager,
        project.status,
        project.priority,
        project.start,
        project.end,
        project.budget,
        CURRENCY,
        project.progress,
        actorId,
      ],
    );
    const projectId = rows[0]!.id;
    projectIds.push(projectId);

    const milestones = [
      { title: "Cadrage et validation du périmètre", offset: -20, done: true },
      { title: "Livraison intermédiaire", offset: 15, done: false },
      { title: "Recette et clôture", offset: 45, done: false },
    ];
    for (const [index, milestone] of milestones.entries()) {
      await tx.query(
        `insert into project_milestones
          (organization_id, project_id, title, due_date, completed_at, position)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          orgId,
          projectId,
          milestone.title,
          daysFromToday(milestone.offset),
          milestone.done ? isoDaysAgo(15) : null,
          (index + 1) * 10,
        ],
      );
    }

    for (const userId of [project.manager, users.employee]) {
      await tx.query(
        `insert into project_members (project_id, user_id, role) values ($1, $2, 'member')
         on conflict do nothing`,
        [projectId, userId],
      );
    }
  }

  return projectIds;
}

async function seedTasks(
  tx: SqlExecutor,
  orgId: string,
  actorId: string,
  users: Record<RoleKey, string>,
  projectIds: string[],
) {
  const tasks = [
    { title: "Rédiger la note de cadrage", status: "done", priority: "high", project: 0, assignee: users.manager, due: -30 },
    { title: "Recueillir les besoins utilisateurs", status: "done", priority: "high", project: 0, assignee: users.employee, due: -20 },
    { title: "Configurer l'environnement de recette", status: "in_progress", priority: "critical", project: 0, assignee: users.manager, due: 5 },
    { title: "Former les référents métiers", status: "todo", priority: "medium", project: 0, assignee: users.employee, due: 25 },
    { title: "Valider le plan de campagne", status: "review", priority: "high", project: 1, assignee: users.department_manager, due: 3 },
    { title: "Préparer les supports de communication", status: "in_progress", priority: "medium", project: 1, assignee: users.employee, due: 18 },
    { title: "Identifier les partenaires relais", status: "blocked", priority: "low", project: 1, assignee: users.director, due: 30 },
    { title: "Archiver les livrables du site", status: "done", priority: "low", project: 2, assignee: users.director, due: -12 },
    { title: "Mettre à jour la base clients", status: "todo", priority: "medium", project: null, assignee: users.employee, due: 7 },
    { title: "Préparer le comité de direction", status: "todo", priority: "high", project: null, assignee: users.owner ?? null, due: 4 },
  ];

  for (const [index, task] of tasks.entries()) {
    const rows = await tx.query<{ id: string }>(
      `insert into tasks
        (organization_id, project_id, title, description, status, priority, assignee_id, due_date,
         completed_at, position, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [
        orgId,
        task.project === null ? null : projectIds[task.project]!,
        task.title,
        "Tâche fictive du jeu de démonstration.",
        task.status,
        task.priority,
        task.assignee ?? null,
        daysFromToday(task.due),
        task.status === "done" ? isoDaysAgo(Math.abs(task.due)) : null,
        (index + 1) * 10,
        actorId,
      ],
    );
    if (task.status !== "todo") {
      await tx.query(
        `insert into task_comments (organization_id, task_id, author_id, body)
         values ($1, $2, $3, $4)`,
        [orgId, rows[0]!.id, task.assignee ?? actorId, "Commentaire de démonstration."],
      );
    }
  }
}

async function seedDocuments(
  tx: SqlExecutor,
  orgId: string,
  actorId: string,
) {
  const documents = [
    {
      name: "Politique de confidentialité (démo).md",
      category: "legal",
      mime: "text/markdown",
      content: "# Politique de confidentialité — document de démonstration\n\nCe fichier est fictif.\n",
    },
    {
      name: "Modèle de contrat de prestation (démo).txt",
      category: "contract",
      mime: "text/plain",
      content: "CONTRAT DE PRESTATION — MODÈLE DE DÉMONSTRATION\n\nParties : ...\n",
    },
    {
      name: "Suivi budgétaire (démo).csv",
      category: "report",
      mime: "text/csv",
      content: "poste;montant_minor\nFormation;1200000\nDeplacement;450000\n",
    },
  ];

  let folderId: string | null = null;
  const folders = await tx.query<{ id: string }>(
    "select id from document_folders where organization_id = $1 and name = 'Démonstration'",
    [orgId],
  );
  if (folders.length > 0) {
    folderId = folders[0]!.id;
  } else {
    const created = await tx.query<{ id: string }>(
      `insert into document_folders (organization_id, name, created_by) values ($1, 'Démonstration', $2)
       returning id`,
      [orgId, actorId],
    );
    folderId = created[0]!.id;
  }

  for (const document of documents) {
    const rows = await tx.query<{ id: string }>(
      `insert into documents
        (organization_id, folder_id, name, description, category, mime_type, size_bytes,
         storage_provider, storage_path, checksum, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'local', '', $8, $9)
       returning id`,
      [
        orgId,
        folderId,
        document.name,
        "Document fictif de démonstration.",
        document.category,
        document.mime,
        0,
        "",
        actorId,
      ],
    );
    const documentId = rows[0]!.id;
    const buffer = Buffer.from(document.content, "utf8");
    const storagePath = buildStoragePath(orgId, documentId, document.name);
    await saveFile(storagePath, buffer);
    await tx.query(
      "update documents set storage_path = $2, size_bytes = $3, checksum = $4 where id = $1",
      [documentId, storagePath, buffer.byteLength, checksum(buffer)],
    );
  }
}

async function seedHrFinance(
  tx: SqlExecutor,
  orgId: string,
  actorId: string,
  users: Record<RoleKey, string>,
  departmentIds: Record<string, string>,
  projectIds: string[],
  customerIds: string[],
) {
  const employees = [
    { first: "Amina", last: "Traoré", title: "Directrice générale", dept: "Direction", userId: users.owner, salary: money(1_800_000) },
    { first: "Moussa", last: "Diallo", title: "Directeur des opérations", dept: "Opérations", userId: users.director, salary: money(1_200_000) },
    { first: "Fatou", last: "Bello", title: "Responsable commerciale", dept: "Commercial", userId: users.department_manager, salary: money(900_000) },
    { first: "Ibrahim", last: "Sani", title: "Chef de projet", dept: "Opérations", userId: users.manager, salary: money(700_000) },
    { first: "Aïcha", last: "Kouassi", title: "Chargée de clientèle", dept: "Commercial", userId: users.employee, salary: money(450_000) },
  ];

  const employeeIds: string[] = [];
  for (const employee of employees) {
    const rows = await tx.query<{ id: string }>(
      `insert into employees
        (organization_id, user_id, first_name, last_name, email, department_id, job_title,
         contract_type, hire_date, status, base_salary_minor, currency, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'cdi', $8, 'active', $9, $10, $11)
       returning id`,
      [
        orgId,
        employee.userId ?? null,
        employee.first,
        employee.last,
        `${employee.first.toLowerCase()}.${employee.last.toLowerCase()}@demo.organix.local`,
        departmentIds[employee.dept]!,
        employee.title,
        daysFromToday(-600),
        employee.salary,
        CURRENCY,
        actorId,
      ],
    );
    employeeIds.push(rows[0]!.id);
  }

  await tx.query(
    `insert into leave_requests
      (organization_id, employee_id, type, start_date, end_date, days, reason, status, created_at)
     values ($1, $2, 'annual', $3, $4, 5, 'Congé annuel (démonstration).', 'pending', now())`,
    [orgId, employeeIds[4]!, daysFromToday(20), daysFromToday(25)],
  );
  await tx.query(
    `insert into leave_requests
      (organization_id, employee_id, type, start_date, end_date, days, reason, status)
     values ($1, $2, 'sick', $3, $4, 2, 'Arrêt maladie (démonstration).', 'approved')`,
    [orgId, employeeIds[3]!, daysFromToday(-15), daysFromToday(-13)],
  );

  // Contrats de travail fictifs (un par employé) et pointage des sept derniers jours.
  for (const [index, employeeId] of employeeIds.entries()) {
    await tx.query(
      `insert into employee_contracts
        (organization_id, employee_id, reference, type, start_date, salary_minor, currency, signed_at, notes)
       values ($1, $2, $3, 'cdi', $4, $5, $6, $4, 'Contrat fictif de démonstration.')`,
      [
        orgId,
        employeeId,
        `CDI-DEMO-${String(index + 1).padStart(3, "0")}`,
        daysFromToday(-600),
        employees[index]!.salary,
        CURRENCY,
      ],
    );
  }

  const attendanceStatuses = ["present", "present", "remote", "late"];
  for (const [employeeIndex, employeeId] of employeeIds.slice(0, 4).entries()) {
    for (let offset = 1; offset <= 7; offset += 1) {
      const workDate = new Date();
      workDate.setDate(workDate.getDate() - offset);
      if (workDate.getDay() === 0 || workDate.getDay() === 6) continue;
      const status = attendanceStatuses[(employeeIndex + offset) % attendanceStatuses.length]!;
      await tx.query(
        `insert into attendance_records
          (organization_id, employee_id, work_date, check_in, check_out, status, notes)
         values ($1, $2, $3, $4, $5, $6, 'Pointage fictif de démonstration.')
         on conflict (employee_id, work_date) do nothing`,
        [
          orgId,
          employeeId,
          workDate.toISOString().slice(0, 10),
          status === "late" ? "09:45" : "08:00",
          "17:00",
          status,
        ],
      );
    }
  }

  const partners = [
    { name: "Fournitures Générales du Niger", type: "supplier", city: "Niamey" },
    { name: "Chambre de Commerce (exemple)", type: "institution", city: "Niamey" },
    { name: "Réseau des ONG du Sahel", type: "ngo", city: "Maradi" },
  ];
  for (const partner of partners) {
    const rows = await tx.query<{ id: string }>(
      `insert into partners
        (organization_id, name, type, email, phone, city, country, contact_person, status, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, 'Niger', $7, 'active', $8, $9)
       returning id`,
      [
        orgId,
        partner.name,
        partner.type,
        "contact@partenaire.example",
        "+227 90 00 00 20",
        partner.city,
        "Responsable partenariats",
        "Partenaire fictif de démonstration.",
        actorId,
      ],
    );
    await tx.query(
      `insert into partner_contacts (organization_id, partner_id, full_name, email, phone, role_title, is_primary)
       values ($1, $2, $3, $4, $5, $6, true)`,
      [orgId, rows[0]!.id, "Contact partenaire", "contact@partenaire.example", "+227 90 00 00 21", "Chargé de compte"],
    );
  }

  // Conventions fictives : une active, une arrivée à échéance.
  const partnerIds = await tx.query<{ id: string }>(
    "select id from partners where organization_id = $1 order by name",
    [orgId],
  );
  const agreements = [
    { index: 0, title: "Convention d'achat de fournitures", reference: "CONV-DEMO-001", start: -300, end: 330, status: "active" },
    { index: 1, title: "Accord de partenariat institutionnel", reference: "CONV-DEMO-002", start: -400, end: -10, status: "expired" },
  ];
  for (const agreement of agreements) {
    const partnerId = partnerIds[agreement.index]?.id;
    if (!partnerId) continue;
    await tx.query(
      `insert into partner_agreements
        (organization_id, partner_id, title, reference, start_date, end_date, status, notes)
       values ($1, $2, $3, $4, $5, $6, $7, 'Convention fictive de démonstration.')`,
      [
        orgId,
        partnerId,
        agreement.title,
        agreement.reference,
        daysFromToday(agreement.start),
        daysFromToday(agreement.end),
        agreement.status,
      ],
    );
  }

  // Devis fictifs : un envoyé, un accepté.
  const quotes = [
    { number: "DEV-DEMO-001", subject: "Refonte du site institutionnel", status: "sent", issue: -12, valid: 18, subtotal: money(2_500_000), customer: 0 },
    { number: "DEV-DEMO-002", subject: "Accompagnement et formation", status: "accepted", issue: -30, valid: 0, subtotal: money(1_800_000), customer: 1 },
  ];
  for (const quote of quotes) {
    const customerId = customerIds[quote.customer] ?? customerIds[0]!;
    const tax = Math.round(quote.subtotal * 0.19);
    const rows = await tx.query<{ id: string }>(
      `insert into quotes
        (organization_id, number, customer_id, subject, status, issue_date, valid_until, currency,
         subtotal_minor, tax_rate, total_minor, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 19, $10, $11, $12)
       returning id`,
      [
        orgId,
        quote.number,
        customerId,
        quote.subject,
        quote.status,
        daysFromToday(quote.issue),
        daysFromToday(quote.issue + 30),
        CURRENCY,
        quote.subtotal,
        quote.subtotal + tax,
        "Devis fictif de démonstration (non contractuel).",
        actorId,
      ],
    );
    await tx.query(
      `insert into quote_items (quote_id, description, quantity, unit_price_minor, amount_minor, position)
       values ($1, $2, 1, $3, $3, 10)`,
      [rows[0]!.id, quote.subject, quote.subtotal],
    );
  }

  const invoices = [
    { number: "FAC-DEMO-001", customer: 0, status: "paid", subtotal: money(4_000_000), paid: money(4_000_000), issue: -45, due: -15 },
    { number: "FAC-DEMO-002", customer: 1, status: "partial", subtotal: money(6_000_000), paid: money(2_000_000), issue: -20, due: 10 },
    { number: "FAC-DEMO-003", customer: 2, status: "sent", subtotal: money(1_500_000), paid: 0, issue: -5, due: 25 },
  ];

  for (const [index, invoice] of invoices.entries()) {
    const customerId = customerIds[invoice.customer] ?? customerIds[0]!;
    const rows = await tx.query<{ id: string }>(
      `insert into invoices
        (organization_id, number, customer_id, project_id, status, issue_date, due_date, currency,
         subtotal_minor, tax_rate, tax_minor, total_minor, amount_paid_minor, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 19, $10, $11, $12, $13, $14)
       returning id`,
      [
        orgId,
        invoice.number,
        customerId,
        null,
        invoice.status,
        daysFromToday(invoice.issue),
        daysFromToday(invoice.due),
        CURRENCY,
        invoice.subtotal,
        Math.round(invoice.subtotal * 0.19),
        Math.round(invoice.subtotal * 1.19),
        invoice.paid,
        "Facture fictive de démonstration — ne constitue pas une pièce comptable.",
        actorId,
      ],
    );
    const invoiceId = rows[0]!.id;
    await tx.query(
      `insert into invoice_items (invoice_id, description, quantity, unit_price_minor, amount_minor, position)
       values ($1, $2, 1, $3, $3, 10)`,
      [invoiceId, "Prestation de démonstration", invoice.subtotal],
    );
    if (invoice.paid > 0) {
      await tx.query(
        `insert into payments
          (organization_id, invoice_id, amount_minor, currency, paid_at, method, reference, notes, created_by)
         values ($1, $2, $3, $4, $5, 'transfer', $6, 'Encaissement fictif.', $7)`,
        [orgId, invoiceId, invoice.paid, CURRENCY, daysFromToday(invoice.issue + 5), `VIR-DEMO-${index + 1}`, actorId],
      );
    }
  }

  const incomeCategories = await tx.query<{ id: string; name: string }>(
    "select id, name from financial_categories where organization_id = $1 and kind = 'income' order by name",
    [orgId],
  );
  const revenues = [
    { label: "Encaissement facture FAC-DEMO-001", amount: money(4_000_000), received: -40, category: 0 },
    { label: "Prestation de conseil (démonstration)", amount: money(1_250_000), received: -65, category: 1 },
  ];
  for (const [index, revenue] of revenues.entries()) {
    await tx.query(
      `insert into revenues
        (organization_id, category_id, label, amount_minor, currency, received_at, method, reference, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, 'transfer', $7, $8, $9)`,
      [
        orgId,
        incomeCategories[revenue.category]?.id ?? incomeCategories[0]?.id ?? null,
        revenue.label,
        revenue.amount,
        CURRENCY,
        daysFromToday(revenue.received),
        `REC-DEMO-${index + 1}`,
        "Recette fictive de démonstration (non certifiée).",
        actorId,
      ],
    );
  }

  const expenseCategories = await tx.query<{ id: string; name: string }>(
    "select id, name from financial_categories where organization_id = $1 and kind = 'expense' order by name",
    [orgId],
  );
  const expenses = [
    { label: "Fournitures de bureau", amount: money(120_000), date: -25, status: "approved", dept: "Direction" },
    { label: "Déplacement mission Maradi", amount: money(350_000), date: -18, status: "approved", dept: "Opérations" },
    { label: "Hébergement et connexion", amount: money(450_000), date: -12, status: "approved", dept: "Opérations" },
    { label: "Campagne de communication", amount: money(800_000), date: -6, status: "pending", dept: "Commercial" },
    { label: "Maintenance informatique", amount: money(200_000), date: -2, status: "pending", dept: "Opérations" },
  ];
  for (const [index, expense] of expenses.entries()) {
    await tx.query(
      `insert into expenses
        (organization_id, category_id, label, amount_minor, currency, expense_date, project_id,
         department_id, supplier, method, reference, status, approved_by, approved_at, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'transfer', $10, $11, $12, $13, $14, $15)`,
      [
        orgId,
        expenseCategories[index % Math.max(expenseCategories.length, 1)]?.id ?? null,
        expense.label,
        expense.amount,
        CURRENCY,
        daysFromToday(expense.date),
        index === 1 ? projectIds[0]! : null,
        departmentIds[expense.dept]!,
        "Fournisseur fictif",
        `DEP-DEMO-${index + 1}`,
        expense.status,
        expense.status === "approved" ? users.owner : null,
        expense.status === "approved" ? isoDaysAgo(Math.abs(expense.date) - 1) : null,
        "Dépense fictive de démonstration (non certifiée).",
        actorId,
      ],
    );
  }

  await tx.query(
    `insert into announcements (organization_id, title, body, audience, is_pinned, created_by)
     values ($1, 'Bienvenue dans la démonstration ORGANIX', $2, 'all', true, $3)`,
    [
      orgId,
      "Cet espace contient uniquement des données fictives. Toute donnée réelle doit être créée dans une organisation distincte, marquée comme production.",
      actorId,
    ],
  );

  await tx.query(
    `insert into calendar_events (organization_id, title, description, starts_at, ends_at, location, visibility, created_by)
     values ($1, 'Comité de direction', 'Réunion hebdomadaire (démonstration).', $2, $3, 'Salle de réunion', 'organization', $4)`,
    [orgId, isoDaysAgo(-3), isoDaysAgo(-3), actorId],
  );

  for (const userId of [users.department_manager, users.manager]) {
    await tx.query(
      `insert into notifications (organization_id, user_id, type, title, body, link)
       values ($1, $2, 'task', 'Tâche à échéance proche', 'Une tâche de démonstration arrive à échéance.', '/app/taches')`,
      [orgId, userId],
    );
  }

  return employeeIds;
}

async function main() {
  if (process.env.DATABASE_MODE === "postgres" && process.env.ORGANIX_SEED_ALLOW_REMOTE !== "true") {
    console.error(
      "[seed] Refus : base distante détectée (DATABASE_MODE=postgres).\n" +
        "        Créer des données de démonstration sur une base distante exige\n" +
        "        ORGANIX_SEED_ALLOW_REMOTE=true, et l'organisation créée restera marquée is_demo.",
    );
    process.exitCode = 1;
    return;
  }

  const password = await seedPassword();
  const userIds = {} as Record<RoleKey, string>;

  // 1. Comptes (accès privilégié : création des profils et identifiants uniquement).
  for (const user of DEMO_USERS) {
    await privileged(async (tx) => {
      const userId = await upsertProfile(tx, user, true);
      userIds[user.role] = userId;
      await writeCredentials(tx, userId, password);
    });
  }

  // 2. Organisation de démonstration (rôles, pipeline, catégories, modules).
  if (FORCE) {
    const removed = await privileged((tx) => deleteDemoOrganization(tx));
    if (removed > 0) console.info(`[seed] Organisation de démonstration précédente supprimée (${removed}).`);
  } else {
    const existing = await privileged((tx) =>
      tx.query<{ id: string }>("select id from organizations where is_demo = true"),
    );
    if (existing.length > 0) {
      console.info(
        `[seed] L'organisation de démonstration « ${DEMO_SLUG} » existe déjà.\n` +
          "       Utilisez `npm run db:seed -- --force` pour la recréer (elle seule est supprimée).",
      );
      await closeDb();
      return;
    }
  }

  const owner = DEMO_USERS[0]!;
  const { organizationId } = await createOrganization({
    userId: userIds.owner!,
    userEmail: owner.email,
    name: "Entreprise Témoin (démonstration)",
    slug: DEMO_SLUG,
    industry: "Services aux organisations",
    country: "Niger",
    city: "Niamey",
    currency: CURRENCY,
    timezone: "Africa/Niamey",
    language: "fr",
    isDemo: true,
  });

  // 3. Départements et membres.
  const departmentIds: Record<string, string> = {};
  await privileged(async (tx) => {
    for (const department of DEPARTMENTS) {
      const rows = await tx.query<{ id: string }>(
        `insert into departments (organization_id, name, code, description)
         values ($1, $2, $3, $4) returning id`,
        [organizationId, department.name, department.code, department.description],
      );
      departmentIds[department.name] = rows[0]!.id;
    }
    await tx.query(
      "update departments set manager_id = $2 where organization_id = $1 and name = 'Direction'",
      [organizationId, userIds.owner],
    );

    for (const user of DEMO_USERS.slice(1)) {
      await addMember(
        tx,
        organizationId,
        userIds[user.role]!,
        user.role,
        departmentIds[user.department] ?? null,
        user.jobTitle,
      );
    }
  });

  // 4. Données métier.
  const customerIds = await privileged((tx) =>
    seedCrm(tx, organizationId, userIds.owner!, userIds),
  );
  const projectIds = await privileged((tx) =>
    seedProjects(tx, organizationId, userIds.owner!, userIds, customerIds, departmentIds),
  );
  await privileged((tx) => seedTasks(tx, organizationId, userIds.owner!, userIds, projectIds));
  await privileged((tx) => seedDocuments(tx, organizationId, userIds.owner!));
  await privileged((tx) =>
    seedHrFinance(tx, organizationId, userIds.owner!, userIds, departmentIds, projectIds, customerIds),
  );

  const counts = await privileged(async (tx) => {
    const result: Record<string, number> = {};
    for (const table of [
      "customers",
      "leads",
      "opportunities",
      "projects",
      "tasks",
      "documents",
      "employees",
      "invoices",
      "expenses",
      "partners",
    ]) {
      const rows = await tx.query<{ count: number }>(
        `select count(*)::int as count from ${table} where organization_id = $1`,
        [organizationId],
      );
      result[table] = rows[0]!.count;
    }
    return result;
  });

  await closeDb();

  console.info("\n=== Données de DÉMONSTRATION créées (fictives) ===");
  console.info(`Organisation : Entreprise Témoin (démonstration) — slug ${DEMO_SLUG}, is_demo = true`);
  for (const [table, count] of Object.entries(counts)) {
    console.info(`  ${table.padEnd(14)} ${count}`);
  }
  console.info("\nComptes (mot de passe commun, à changer immédiatement) :");
  for (const user of DEMO_USERS) {
    console.info(`  ${user.email.padEnd(34)} ${DEFAULT_ROLES.find((role) => role.key === user.role)?.name}`);
  }
  console.info(`\nMot de passe : ${password}\n`);
  console.info("Rappel : ces données ne doivent jamais être présentées comme réelles.");
}

main().catch(async (error) => {
  console.error("[seed] Échec :", error);
  process.exitCode = 1;
  await closeDb().catch(() => {});
});
