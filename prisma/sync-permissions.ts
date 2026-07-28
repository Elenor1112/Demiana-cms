/**
 * Sync the permission catalog and role→permission matrix from `src/lib/rbac.ts`
 * into the database, without touching any other seeded data.
 *
 * Run after adding or changing permissions:  npm run db:sync-permissions
 * The full seed does this too, but re-seeds demo data along with it, which is
 * not what you want against a live database.
 */
import { PrismaClient, RoleKey } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLE_META, type PermissionKey } from "../src/lib/rbac";

const db = new PrismaClient();

async function main() {
  console.log("🔐 Syncing permissions…");

  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { description, group: key.split(".")[0] },
      create: { key, description, group: key.split(".")[0] },
    });
  }

  // Drop catalog entries that no longer exist in code, so revoked permissions
  // cannot linger as per-user grants.
  const known = Object.keys(PERMISSIONS);
  const removed = await db.permission.deleteMany({ where: { key: { notIn: known } } });
  if (removed.count) console.log(`  removed ${removed.count} stale permission(s)`);

  const permByKey = new Map((await db.permission.findMany()).map((p) => [p.key, p.id]));

  // Create any role declared in ROLE_META but missing from the database.
  // Adding a RoleKey to the enum is not enough on its own — without a Role row
  // nobody can be assigned to it, and the permission loop below would skip it
  // entirely. Existing rows are left alone apart from their metadata, so this
  // never disturbs a live role.
  for (const [key, meta] of Object.entries(ROLE_META) as [RoleKey, (typeof ROLE_META)[RoleKey]][]) {
    await db.role.upsert({
      where: { key },
      update: { name: meta.name, description: meta.description, level: meta.level, isSuperAdmin: meta.isSuperAdmin },
      create: {
        key, name: meta.name, description: meta.description,
        level: meta.level, isSuperAdmin: meta.isSuperAdmin,
      },
    });
  }

  for (const role of await db.role.findMany()) {
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = (ROLE_PERMISSIONS[role.key as RoleKey] ?? []) as PermissionKey[];
    await db.rolePermission.createMany({
      data: perms
        .map((p) => permByKey.get(p))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    console.log(`  ${role.key} → ${perms.length} permissions`);
  }

  const jd = await db.permission.findMany({
    where: { group: "JobDescription" },
    select: { key: true },
    orderBy: { key: "asc" },
  });
  console.log(`✅ JobDescription permissions: ${jd.map((p) => p.key).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("Permission sync failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
