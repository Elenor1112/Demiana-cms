/**
 * Install every database-level invariant in prisma/sql/.
 *
 * `prisma db push` only knows about the schema, so triggers and CHECK
 * constraints declared in raw SQL have to be applied separately. Every file
 * here is written to be idempotent (CREATE OR REPLACE / DROP IF EXISTS), so
 * this is safe to run on every deploy.
 *
 * Usage:  npm run db:sync-triggers
 */
import { PrismaClient } from "@prisma/client";
import { applySqlFile } from "./sql-utils";

const db = new PrismaClient();

/** Applied in order. Later files may depend on tables created by earlier ones. */
const SQL_FILES = [
  "prisma/sql/task-client-sync.sql",
  "prisma/sql/sales-attachment-parent.sql",
];

async function main() {
  for (const file of SQL_FILES) {
    await applySqlFile(db, file);
    console.log(`✓ applied ${file}`);
  }
  console.log("\nAll database invariants installed.");
}

main()
  .catch((e) => {
    console.error("trigger sync failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
