/**
 * Reset the database to a clean production state:
 *  - Deletes ALL operational demo data (tasks, projects, clients, leave,
 *    permissions, resignations, approvals, notifications, audit, EOTM scores,
 *    warnings, reviews, attendance, comments, activities, etc.)
 *  - Deletes all users EXCEPT the CEO (ceo@elenor.com by default)
 *  - PRESERVES roles, permissions, departments, policies, and EOTM config
 *
 * Usage: npx tsx prisma/reset-to-ceo.ts [ceo-email]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CEO_EMAIL = (process.argv[2] || "ceo@elenor.com").toLowerCase();

async function main() {
  const ceo = await db.user.findUnique({ where: { email: CEO_EMAIL } });
  if (!ceo) {
    console.error(`❌ No user found with email "${CEO_EMAIL}". Aborting — nothing deleted.`);
    process.exit(1);
  }
  console.log(`🧹 Keeping CEO: ${ceo.firstName} ${ceo.lastName} <${ceo.email}>`);

  // 1) Wipe operational data (order respects foreign keys).
  console.log("Deleting operational data…");
  await db.checklistItem.deleteMany({});
  await db.attachment.deleteMany({});
  await db.comment.deleteMany({});
  await db.activity.deleteMany({});
  await db.taskAssignee.deleteMany({});
  await db.taskFollower.deleteMany({});
  await db.taskLabel.deleteMany({});
  await db.taskDependency.deleteMany({});
  await db.task.deleteMany({});
  await db.projectMember.deleteMany({});
  await db.project.deleteMany({});
  await db.client.deleteMany({});
  await db.label.deleteMany({});

  await db.approvalStep.deleteMany({});
  await db.offboardingItem.deleteMany({});
  await db.resignation.deleteMany({});
  await db.leaveRequest.deleteMany({});
  await db.permissionRequest.deleteMany({});

  await db.eotmScore.deleteMany({});
  await db.eotmWinner.deleteMany({});
  await db.achievement.deleteMany({});
  await db.warning.deleteMany({});
  await db.performanceReview.deleteMany({});
  await db.attendance.deleteMany({});
  await db.employeeDocument.deleteMany({});
  await db.policyAck.deleteMany({});

  await db.notification.deleteMany({});
  await db.auditLog.deleteMany({});
  await db.refreshToken.deleteMany({});
  await db.userPermission.deleteMany({ where: { userId: { not: ceo.id } } });

  // 2) Detach CEO from anything pointing at other users, then delete other users.
  await db.department.updateMany({ data: { headId: null } });
  await db.user.update({ where: { id: ceo.id }, data: { managerId: null } });

  const del = await db.user.deleteMany({ where: { id: { not: ceo.id } } });
  console.log(`Deleted ${del.count} non-CEO user(s).`);

  const remaining = await db.user.findMany({ select: { email: true, role: { select: { name: true } } } });
  console.log("\n✅ Done. Remaining users:");
  remaining.forEach((u) => console.log(`   ${u.email} — ${u.role.name}`));
  console.log("\nPreserved: roles, permissions, departments, policies, EOTM config.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
