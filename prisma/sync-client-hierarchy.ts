/**
 * Enforce the Client → Project → Task hierarchy.
 *
 *   1. Reports projects with no client (these BLOCK the NOT NULL constraint).
 *   2. Backfills task.clientId from each task's project.
 *   3. Installs the database triggers that keep the two in sync thereafter.
 *
 * Safe to re-run: the backfill only touches rows that disagree with their
 * project, and the trigger DDL is CREATE OR REPLACE / DROP IF EXISTS.
 *
 * Usage:
 *   npx tsx prisma/sync-client-hierarchy.ts           # dry run (default)
 *   npx tsx prisma/sync-client-hierarchy.ts --apply   # writes
 */
import { PrismaClient } from "@prisma/client";
import { applySqlFile } from "./sql-utils";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY RUN (pass --apply to write)\n");

  // ── 1. Projects with no client ────────────────────────────────
  // Raw SQL: once the NOT NULL migration has run, Prisma's types no longer
  // admit `clientId: null`, but the check must still work when this script is
  // run BEFORE the migration on another environment.
  const orphanProjects = await db.$queryRawUnsafe<
    { id: string; name: string; status: string; task_count: number }[]
  >(
    `select p.id, p.name, p.status::text as status,
            (select count(*)::int from "Task" t where t."projectId" = p.id) as task_count
     from "Project" p where p."clientId" is null`
  );

  if (orphanProjects.length) {
    console.log(`⚠ ${orphanProjects.length} PROJECT(S) WITHOUT A CLIENT — these block`);
    console.log("  the NOT NULL constraint and need a client assigned manually:\n");
    for (const p of orphanProjects) {
      console.log(`    "${p.name}" (${p.status}, ${p.task_count} tasks)  id=${p.id}`);
    }
    console.log("\n  Assign each a client, then re-run. Nothing else was changed.");
    process.exitCode = 1;
    return;
  }
  console.log("✓ every project has a client\n");

  // ── 2. Tasks whose client disagrees with their project ────────
  const drifted = await db.$queryRawUnsafe<any[]>(
    `select t.id, t.code, t."clientId" as task_client, p."clientId" as project_client, p.name as project
     from "Task" t join "Project" p on p.id = t."projectId"
     where t."projectId" is not null and t."clientId" is distinct from p."clientId"`
  );
  console.log(`tasks to re-sync from their project: ${drifted.length}`);
  for (const d of drifted.slice(0, 20)) {
    console.log(`   ${d.code.padEnd(10)} "${d.project}"  ${d.task_client ?? "null"} -> ${d.project_client}`);
  }
  if (drifted.length > 20) console.log(`   … ${drifted.length - 20} more`);

  if (APPLY && drifted.length) {
    const n = await db.$executeRawUnsafe(
      `update "Task" t set "clientId" = p."clientId"
       from "Project" p
       where p.id = t."projectId"
         and t."clientId" is distinct from p."clientId"`
    );
    console.log(`   updated ${n} task(s)`);
  }

  // ── 3. Standalone tasks (no project) — reported, not touched ──
  const standalone = await db.task.findMany({
    where: { projectId: null },
    select: { code: true, title: true, clientId: true },
  });
  console.log(`\nstandalone tasks (no project, client left as-is): ${standalone.length}`);
  for (const s of standalone) {
    console.log(`   ${s.code.padEnd(10)} client=${s.clientId ?? "none"}  "${s.title.slice(0, 40)}"`);
  }

  // ── 4. Triggers ───────────────────────────────────────────────
  if (APPLY) {
    await applySqlFile(db, "prisma/sql/task-client-sync.sql");
    console.log("\n✓ triggers installed (task_sync_client, project_cascade_client)");
  } else {
    console.log("\n(dry run — triggers not installed)");
  }

  console.log(APPLY ? "\nDone." : "\nDRY RUN complete. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error("sync failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
