/**
 * Shared helpers for applying the raw-SQL files in prisma/sql/.
 *
 * Extracted from sync-client-hierarchy.ts so the trigger/constraint installer
 * and the hierarchy backfill share one implementation rather than each carrying
 * their own copy of the statement splitter.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";

/**
 * Split a SQL file into individual statements.
 *
 * Naive splitting on ";" would cut plpgsql function bodies in half, since those
 * contain semicolons of their own — so $$-delimited blocks are tracked and
 * their contents left untouched. Line comments are stripped so a ";" inside one
 * cannot end a statement early.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    const code = line.replace(/--.*$/, "");
    // Each $$ toggles in/out of a quoted body; a line may contain two.
    const markers = (code.match(/\$\$/g) ?? []).length;
    for (let i = 0; i < markers; i++) inDollar = !inDollar;
    buf += code + "\n";
    if (!inDollar && code.includes(";")) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Execute one prisma/sql/*.sql file, statement by statement.
 *
 * Prisma prepares every statement and Postgres rejects multiple commands in one
 * prepared statement, which is why the file cannot simply be sent whole.
 */
export async function applySqlFile(db: PrismaClient, relativePath: string) {
  const sql = readFileSync(join(process.cwd(), relativePath), "utf8");
  for (const stmt of splitSqlStatements(sql)) {
    await db.$executeRawUnsafe(stmt);
  }
}
