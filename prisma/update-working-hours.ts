/**
 * Update ONLY the "working-hours" policy body in the live database.
 *
 * Unlike `npm run db:seed`, this touches a single row — it will not recreate
 * demo users, clients, projects or tasks.
 *
 * Bumps `version` because this policy requires acknowledgement: the app gates
 * acks on `policyId:version`, so existing sign-offs against the old 9–5 hours
 * are correctly invalidated and staff are re-prompted. Past PolicyAck rows are
 * preserved as an audit trail of who agreed to which version.
 *
 * Usage: npm run db:update-hours
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SLUG = "working-hours";
const BODY =
  "Standard working hours are 10:00 AM – 6:00 PM, Sunday to Thursday. Employees must check in on time. Repeated lateness is tracked and may result in a Blue Card warning. Attendance is recorded in Elenor OS.";

async function main() {
  const existing = await db.policy.findUnique({ where: { slug: SLUG } });
  if (!existing) {
    console.error(`❌ No policy found with slug "${SLUG}". Nothing changed.`);
    process.exit(1);
  }

  if (existing.body === BODY) {
    console.log("✅ Already up to date — no change needed.");
    return;
  }

  const acks = await db.policyAck.count({
    where: { policyId: existing.id, version: existing.version },
  });

  console.log(`Before (v${existing.version}):`, existing.body);
  const updated = await db.policy.update({
    where: { slug: SLUG },
    data: { body: BODY, version: { increment: 1 } },
  });
  console.log(`After  (v${updated.version}):`, updated.body);

  console.log("\n✅ Working-hours policy updated. No other rows touched.");
  if (existing.requiresAck && acks > 0) {
    console.log(
      `ℹ️  ${acks} acknowledgement(s) were recorded against v${existing.version}. ` +
        `Those staff will be re-prompted to acknowledge v${updated.version}.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
