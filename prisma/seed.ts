import { PrismaClient, RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PERMISSIONS,
  ROLE_META,
  ROLE_PERMISSIONS,
  type PermissionKey,
} from "../src/lib/rbac";

const db = new PrismaClient();

const PASSWORD = "Elenor@2026";

async function main() {
  console.log("🌱 Seeding Elenor OS…");
  const hash = await bcrypt.hash(PASSWORD, 12);

  // ─── Permissions ───
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { description, group: key.split(".")[0] },
      create: { key, description, group: key.split(".")[0] },
    });
  }
  const allPerms = await db.permission.findMany();
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // ─── Roles + role→permission matrix ───
  for (const [key, meta] of Object.entries(ROLE_META)) {
    const role = await db.role.upsert({
      where: { key: key as RoleKey },
      update: {
        name: meta.name,
        level: meta.level,
        isSuperAdmin: meta.isSuperAdmin,
        description: meta.description,
      },
      create: {
        key: key as RoleKey,
        name: meta.name,
        level: meta.level,
        isSuperAdmin: meta.isSuperAdmin,
        description: meta.description,
      },
    });
    // reset + set permissions
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = ROLE_PERMISSIONS[key as RoleKey] as PermissionKey[];
    await db.rolePermission.createMany({
      data: perms
        .map((p) => permByKey.get(p))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  const roles = await db.role.findMany();
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));

  // ─── Departments ───
  const deptData = [
    { name: "Account Management", color: "#06B6D4" },
    { name: "Design Team", color: "#8B5CF6" },
    { name: "Content Creation", color: "#F59E0B" },
    { name: "Development", color: "#22C55E" },
  ];
  const depts: Record<string, string> = {};
  for (const d of deptData) {
    const dept = await db.department.upsert({
      where: { name: d.name },
      update: { color: d.color },
      create: { name: d.name, color: d.color },
    });
    depts[d.name] = dept.id;
  }

  // ─── Users (full org hierarchy) ───
  type U = {
    email: string; firstName: string; lastName: string; role: RoleKey;
    dept?: string; jobTitle: string; managerEmail?: string; birth?: string;
  };
  const users: U[] = [
    { email: "ceo@elenor.com", firstName: "Nadia", lastName: "Kamal", role: "CEO", jobTitle: "Chief Executive Officer", birth: "1982-03-14" },
    { email: "ops@elenor.com", firstName: "Omar", lastName: "Farouk", role: "OPERATIONS_MANAGER", jobTitle: "Operations Manager", managerEmail: "ceo@elenor.com", birth: "1987-11-02" },
    { email: "account@elenor.com", firstName: "Layla", lastName: "Hassan", role: "ACCOUNT_MANAGER", dept: "Account Management", jobTitle: "Senior Account Manager", managerEmail: "ops@elenor.com", birth: "1990-07-20" },
    { email: "sales@elenor.com", firstName: "Karim", lastName: "Adel", role: "SALES_MANAGER", dept: "Account Management", jobTitle: "Sales Manager", managerEmail: "ops@elenor.com", birth: "1989-01-09" },
    { email: "art@elenor.com", firstName: "Salma", lastName: "Nabil", role: "ART_DIRECTOR", dept: "Design Team", jobTitle: "Art Director", managerEmail: "account@elenor.com", birth: "1991-05-30" },
    { email: "designer@elenor.com", firstName: "Youssef", lastName: "Tarek", role: "DESIGNER", dept: "Design Team", jobTitle: "Senior Designer", managerEmail: "art@elenor.com", birth: "1994-09-12" },
    { email: "designer2@elenor.com", firstName: "Mariam", lastName: "Sami", role: "DESIGNER", dept: "Design Team", jobTitle: "Designer", managerEmail: "art@elenor.com", birth: "1996-12-01" },
    { email: "content@elenor.com", firstName: "Hana", lastName: "Youssef", role: "CONTENT_CREATOR", dept: "Content Creation", jobTitle: "Content Creator", managerEmail: "account@elenor.com", birth: "1995-04-18" },
    { email: "comms@elenor.com", firstName: "Tariq", lastName: "Mahmoud", role: "COMMUNICATION_SPECIALIST", dept: "Content Creation", jobTitle: "Communication Specialist", managerEmail: "account@elenor.com", birth: "1993-08-25" },
    { email: "dev@elenor.com", firstName: "Ziad", lastName: "Ashraf", role: "DEVELOPER", dept: "Development", jobTitle: "Full-Stack Developer", managerEmail: "ops@elenor.com", birth: "1992-02-14" },
  ];

  const userIds: Record<string, string> = {};
  // first pass — create without managers
  for (const u of users) {
    const created = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: hash,
        firstName: u.firstName,
        lastName: u.lastName,
        jobTitle: u.jobTitle,
        roleId: roleByKey.get(u.role)!,
        departmentId: u.dept ? depts[u.dept] : null,
        hireDate: new Date("2024-01-15"),
        birthDate: u.birth ? new Date(u.birth) : null,
        annualLeaveBalance: 21,
        sickLeaveBalance: 10,
      },
    });
    userIds[u.email] = created.id;
  }
  // second pass — wire managers
  for (const u of users) {
    if (u.managerEmail) {
      await db.user.update({
        where: { id: userIds[u.email] },
        data: { managerId: userIds[u.managerEmail] },
      });
    }
  }
  // department heads
  await db.department.update({ where: { id: depts["Design Team"] }, data: { headId: userIds["art@elenor.com"] } });
  await db.department.update({ where: { id: depts["Account Management"] }, data: { headId: userIds["account@elenor.com"] } });

  // ─── Clients ───
  const clientData = [
    { company: "Aurora Cosmetics", contactPerson: "Dina Sherif", email: "dina@auroracosmetics.com", phone: "+20 100 123 4567", industry: "Beauty & Cosmetics" },
    { company: "Nile Fintech", contactPerson: "Ahmed Zaki", email: "ahmed@nilefintech.com", phone: "+20 100 222 3344", industry: "Finance" },
    { company: "GreenLeaf Foods", contactPerson: "Sara Morad", email: "sara@greenleaf.com", phone: "+20 100 555 6677", industry: "Food & Beverage" },
    { company: "Pulse Fitness", contactPerson: "Mohab Ali", email: "mohab@pulsefit.com", phone: "+20 100 888 9900", industry: "Health & Fitness" },
  ];
  const clientIds: string[] = [];
  for (const c of clientData) {
    const client = await db.client.create({ data: c });
    clientIds.push(client.id);
  }

  // ─── Projects ───
  const projectData = [
    { name: "Aurora — Summer Campaign", clientIdx: 0, industry: "Beauty & Cosmetics", lead: "account@elenor.com", status: "ACTIVE" as const },
    { name: "Nile Fintech — Brand Refresh", clientIdx: 1, industry: "Finance", lead: "account@elenor.com", status: "ACTIVE" as const },
    { name: "GreenLeaf — Product Launch", clientIdx: 2, industry: "Food & Beverage", lead: "account@elenor.com", status: "PLANNING" as const },
  ];
  const projectIds: string[] = [];
  for (const p of projectData) {
    const project = await db.project.create({
      data: {
        name: p.name,
        clientId: clientIds[p.clientIdx],
        industry: p.industry,
        status: p.status,
        leadId: userIds[p.lead],
        startDate: new Date("2026-06-01"),
        deadline: new Date("2026-09-30"),
        members: {
          create: [
            { userId: userIds["art@elenor.com"] },
            { userId: userIds["designer@elenor.com"] },
            { userId: userIds["content@elenor.com"] },
          ],
        },
      },
    });
    projectIds.push(project.id);
  }

  // ─── Labels ───
  const labelData = [
    { name: "Design", color: "#8B5CF6" },
    { name: "Content", color: "#F59E0B" },
    { name: "Urgent", color: "#EF4444" },
    { name: "Client Facing", color: "#06B6D4" },
    { name: "Revision", color: "#0EA5E9" },
  ];
  const labelIds: Record<string, string> = {};
  for (const l of labelData) {
    const label = await db.label.upsert({ where: { name: l.name }, update: {}, create: l });
    labelIds[l.name] = label.id;
  }

  // ─── Tasks ───
  const now = Date.now();
  const day = 864e5;
  const tasks = [
    { title: "Design Instagram carousel — Aurora launch", status: "IN_PROGRESS", priority: "HIGH", project: 0, dept: "Design Team", creator: "account@elenor.com", assignees: ["designer@elenor.com"], deadline: 3, progress: 45, labels: ["Design", "Client Facing"] },
    { title: "Write launch copy for GreenLeaf", status: "TODO", priority: "MEDIUM", project: 2, dept: "Content Creation", creator: "account@elenor.com", assignees: ["content@elenor.com"], deadline: 5, progress: 0, labels: ["Content"] },
    { title: "Nile Fintech logo variations", status: "WAITING_APPROVAL", priority: "HIGH", project: 1, dept: "Design Team", creator: "art@elenor.com", assignees: ["designer2@elenor.com"], deadline: 2, progress: 90, labels: ["Design", "Client Facing"], approval: "PENDING" as const },
    { title: "Prepare Aurora campaign brief", status: "DONE", priority: "MEDIUM", project: 0, dept: "Account Management", creator: "account@elenor.com", assignees: ["account@elenor.com"], deadline: -2, progress: 100, labels: ["Client Facing"] },
    { title: "Social media calendar — July", status: "IN_PROGRESS", priority: "URGENT", project: 0, dept: "Content Creation", creator: "account@elenor.com", assignees: ["comms@elenor.com", "content@elenor.com"], deadline: 1, progress: 60, labels: ["Content", "Urgent"] },
    { title: "Revise Aurora product mockups", status: "HOLD", priority: "LOW", project: 0, dept: "Design Team", creator: "art@elenor.com", assignees: ["designer@elenor.com"], deadline: 7, progress: 20, labels: ["Design", "Revision"] },
    { title: "Client feedback — Nile Fintech round 2", status: "TODO", priority: "HIGH", project: 1, dept: "Account Management", creator: "account@elenor.com", assignees: ["account@elenor.com"], deadline: 4, progress: 0, labels: ["Client Facing"] },
  ];

  let counter = 100;
  for (const t of tasks) {
    counter++;
    await db.task.create({
      data: {
        code: `ELN-${counter}`,
        title: t.title,
        status: t.status as any,
        priority: t.priority as any,
        projectId: projectIds[t.project],
        clientId: clientIds[projectData[t.project].clientIdx],
        departmentId: depts[t.dept],
        createdById: userIds[t.creator],
        deadline: new Date(now + t.deadline * day),
        progress: t.progress,
        estimatedHours: 8,
        actualHours: Math.round((t.progress / 100) * 8),
        approvalStatus: (t as any).approval ?? "NOT_REQUIRED",
        assignees: { create: t.assignees.map((e) => ({ userId: userIds[e] })) },
        labels: { create: t.labels.map((l) => ({ labelId: labelIds[l] })) },
        checklist: {
          create: [
            { text: "Initial draft", done: t.progress > 30, order: 0 },
            { text: "Internal review", done: t.progress > 70, order: 1 },
            { text: "Client approval", done: t.progress === 100, order: 2 },
          ],
        },
      },
    });
  }

  // ─── EOTM config ───
  const existingCfg = await db.eotmConfig.findFirst();
  if (!existingCfg) await db.eotmConfig.create({ data: {} });

  // ─── Leave request sample ───
  await db.leaveRequest.create({
    data: {
      requesterId: userIds["designer@elenor.com"],
      type: "ANNUAL",
      startDate: new Date(now + 10 * day),
      endDate: new Date(now + 14 * day),
      days: 3,
      returnDate: new Date(now + 15 * day),
      reason: "Family vacation",
      actingUserId: userIds["designer2@elenor.com"],
      handover: "Mariam will cover ongoing Aurora design tasks.",
      declaration: true,
      status: "PENDING",
    },
  });

  // ─── Policies ───
  await seedPolicies();

  console.log("✅ Seed complete.");
  console.log(`\n👥 Demo logins (password: ${PASSWORD}):`);
  for (const u of users) console.log(`   ${u.email.padEnd(24)} — ${ROLE_META[u.role].name}`);
}

async function seedPolicies() {
  const policies = [
    { slug: "working-hours", title: "Working Hours & Attendance", category: "Attendance", requiresAck: true, order: 1,
      body: "Standard working hours are 10:00 AM – 6:00 PM, Sunday to Thursday. Employees must check in on time. Repeated lateness is tracked and may result in a Blue Card warning. Attendance is recorded in Elenor OS." },
    { slug: "confidentiality", title: "Confidentiality Policy", category: "Conduct", requiresAck: true, order: 2,
      body: "All employees must protect confidential company and client information. Sharing client data, project details, or internal documents externally is strictly prohibited and may result in immediate disciplinary action." },
    { slug: "salary-confidentiality", title: "Salary Confidentiality", category: "Conduct", requiresAck: true, order: 3,
      body: "Compensation details are strictly confidential. Discussing salaries between employees is a breach of policy." },
    { slug: "professional-conduct", title: "Professional Conduct", category: "Conduct", order: 4,
      body: "Employees are expected to maintain professionalism, respect, and integrity toward colleagues and clients at all times." },
    { slug: "equipment", title: "Company Equipment Usage", category: "Assets", order: 5,
      body: "Company equipment must be used responsibly and returned in good condition. Equipment is tracked and must be returned during offboarding." },
    { slug: "social-media", title: "Social Media Policy", category: "Conduct", order: 6,
      body: "Employees must not post confidential or damaging content about Elenor or its clients. Represent the company positively online." },
    { slug: "conflict-of-interest", title: "Conflict of Interest", category: "Conduct", order: 7,
      body: "Employees must disclose any outside work or relationships that may conflict with Elenor's interests." },
    { slug: "dress-code", title: "Dress Code", category: "Conduct", order: 8,
      body: "Smart-casual attire is expected. Client meetings may require business attire." },
    { slug: "workplace-safety", title: "Workplace Safety", category: "Safety", order: 9,
      body: "Maintain a safe working environment. Report hazards immediately." },
    { slug: "leave-policy", title: "Leave Policy", category: "Leave", requiresAck: true, order: 10,
      body: "Annual leave: 21 days/year. Sick leave: 10 days/year. Leave requests must be submitted via Elenor OS and approved by the direct manager and then the Operations Manager. An acting employee and task handover are required." },
    { slug: "resignation-policy", title: "Resignation Policy", category: "Leave", order: 11,
      body: "Resignations require notice. The offboarding checklist (asset return, knowledge transfer, task handover, account deactivation, exit interview) must be completed." },
    { slug: "commission", title: "Quarterly Commission Eligibility", category: "Compensation", order: 12,
      body: "Commission is paid quarterly to eligible roles based on performance targets. Eligibility requires an active, in-good-standing status with no unresolved Red Card warnings." },
    { slug: "disciplinary", title: "Disciplinary Procedure — Card System", category: "Discipline", requiresAck: true, order: 13,
      body: "Elenor uses a three-tier card system: **Blue Card** (verbal/minor), **Yellow Card** (formal written warning), **Red Card** (final warning / serious breach). Accumulated cards affect performance scores and commission eligibility." },
  ];
  for (const p of policies) {
    await db.policy.upsert({ where: { slug: p.slug }, update: p, create: p });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
