/**
 * One-off: correct timestamps written before the timestamptz conversion.
 *
 * Background. Task.deadline (and the other date columns) used to be
 * `timestamp without time zone`. A user in Cairo entering "1:30 PM" had the
 * digits 13:30 stored with no zone attached; once the column became
 * `timestamptz` those digits were read as 13:30 UTC, i.e. 4:30 PM Cairo — the
 * three-hour jump users reported.
 *
 * Fix: reinterpret each legacy value as APP_TIMEZONE wall-clock time rather
 * than UTC. `ts at time zone 'Africa/Cairo'` takes the instant, renders it as
 * Cairo wall time... so to invert the original mistake we take the UTC wall
 * digits and re-anchor them in Cairo.
 *
 * ALREADY APPLIED on 2026-07-27 (15 rows: 6 Task.deadline, 4 Project.deadline,
 * 5 Project.startDate). It is kept for the record and for other environments.
 *
 * Running it twice would shift the same rows a second time — the cutoff is on
 * `createdAt`, which does not change when the value is corrected. The guard
 * below therefore refuses to run unless RUN_ANYWAY=1 is set, so a stray
 * `--apply` cannot silently corrupt already-corrected data.
 *
 * Usage:
 *   npx tsx prisma/backfill-timezone.ts          # dry run, prints a diff
 *   RUN_ANYWAY=1 npx tsx prisma/backfill-timezone.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const TZ = process.env.APP_TIMEZONE ?? "Africa/Cairo";
/** The moment the timestamptz conversion ran. Rows older than this are legacy. */
const CUTOFF = process.env.CUTOFF ?? "2026-07-27T09:56:00Z";
const APPLY = process.argv.includes("--apply");

/** Columns holding a user-entered wall-clock time that the shift corrupted. */
const TARGETS: { table: string; column: string; createdCol: string }[] = [
  { table: "Task", column: "deadline", createdCol: "createdAt" },
  { table: "Project", column: "deadline", createdCol: "createdAt" },
  { table: "Project", column: "startDate", createdCol: "createdAt" },
];

/** SQL that undoes the original misinterpretation. */
const corrected = (col: string) => `((("${col}" at time zone 'UTC')) at time zone '${TZ}')`;

async function main() {
  if (APPLY && process.env.RUN_ANYWAY !== "1") {
    console.error(
      "Refusing to apply: this backfill already ran on 2026-07-27 and is NOT\n" +
      "idempotent — re-applying would shift the same rows again.\n" +
      "If you are certain (e.g. a fresh environment), re-run with RUN_ANYWAY=1."
    );
    process.exit(1);
  }
  console.log(`timezone: ${TZ}`);
  console.log(`cutoff:   ${CUTOFF}`);
  console.log(`mode:     ${APPLY ? "APPLY (writes)" : "DRY RUN"}\n`);

  let total = 0;

  for (const { table, column, createdCol } of TARGETS) {
    const rows = await db.$queryRawUnsafe<any[]>(
      `select id,
              to_char("${column}" at time zone '${TZ}', 'YYYY-MM-DD HH24:MI') as now_shows,
              to_char(${corrected(column)} at time zone '${TZ}', 'YYYY-MM-DD HH24:MI') as will_show
       from "${table}"
       where "${column}" is not null and "${createdCol}" < $1::timestamptz`,
      CUTOFF
    );
    if (!rows.length) {
      console.log(`${table}.${column}: nothing to correct`);
      continue;
    }
    console.log(`${table}.${column}: ${rows.length} row(s)`);
    for (const r of rows.slice(0, 10)) {
      console.log(`   ${r.now_shows}  ->  ${r.will_show}`);
    }
    if (rows.length > 10) console.log(`   … ${rows.length - 10} more`);

    if (APPLY) {
      const res = await db.$executeRawUnsafe(
        `update "${table}"
         set "${column}" = ${corrected(column)}
         where "${column}" is not null and "${createdCol}" < $1::timestamptz`,
        CUTOFF
      );
      console.log(`   updated ${res} row(s)`);
    }
    total += rows.length;
    console.log("");
  }

  console.log(
    APPLY
      ? `Done. ${total} row(s) corrected.`
      : `DRY RUN — ${total} row(s) would change. Re-run with --apply to write.`
  );
}

main()
  .catch((e) => {
    console.error("backfill failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
