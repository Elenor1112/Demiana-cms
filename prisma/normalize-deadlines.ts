/**
 * One-off: normalise legacy date-only deadlines to local midnight.
 *
 * Before time-of-day support, `new Date("2026-07-26")` was stored, which JS
 * parses as UTC midnight. In a non-UTC zone that is some other hour of the day
 * (03:00 at UTC+3), so those rows would now render a misleading time instead of
 * as date-only.
 *
 * Only rows sitting exactly on UTC midnight are touched — anything with a real
 * time-of-day was set deliberately and is left alone.
 *
 * Usage: npm run db:normalize-deadlines [--apply]
 * Without --apply it only reports what it would change.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function isUtcMidnight(d: Date) {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
}

/** Same calendar day the value represents in UTC, but at local midnight. */
function toLocalMidnight(d: Date) {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

async function main() {
  const offset = new Date().getTimezoneOffset();
  console.log(`Local timezone offset: ${offset} minutes (UTC${offset <= 0 ? "+" : "-"}${Math.abs(offset / 60)})`);
  if (offset === 0) {
    console.log("Running in UTC — legacy values already sit at local midnight. Nothing to do.");
    return;
  }

  const tasks = await db.task.findMany({
    where: { deadline: { not: null } },
    select: { id: true, code: true, deadline: true },
  });
  const projects = await db.project.findMany({
    where: { deadline: { not: null } },
    select: { id: true, name: true, deadline: true },
  });

  const taskFixes = tasks.filter((t) => isUtcMidnight(t.deadline!));
  const projectFixes = projects.filter((p) => isUtcMidnight(p.deadline!));

  console.log(`\nTasks:    ${taskFixes.length} of ${tasks.length} look date-only`);
  for (const t of taskFixes) {
    console.log(`   ${t.code}: ${t.deadline!.toISOString()} -> ${toLocalMidnight(t.deadline!).toISOString()}`);
  }
  console.log(`Projects: ${projectFixes.length} of ${projects.length} look date-only`);
  for (const p of projectFixes) {
    console.log(`   ${p.name.trim()}: ${p.deadline!.toISOString()} -> ${toLocalMidnight(p.deadline!).toISOString()}`);
  }

  if (!taskFixes.length && !projectFixes.length) {
    console.log("\nNothing to change.");
    return;
  }
  if (!APPLY) {
    console.log("\nDry run — re-run with --apply to write these changes.");
    return;
  }

  for (const t of taskFixes) {
    await db.task.update({ where: { id: t.id }, data: { deadline: toLocalMidnight(t.deadline!) } });
  }
  for (const p of projectFixes) {
    await db.project.update({ where: { id: p.id }, data: { deadline: toLocalMidnight(p.deadline!) } });
  }
  console.log(`\n✅ Updated ${taskFixes.length} task(s) and ${projectFixes.length} project(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
