import { prisma } from "./prisma";
import type { SessionUser } from "./rbac";

/**
 * Per-user data isolation helpers (Phase 2).
 *
 * Owned models tag rows with `createdById`. Resources can additionally be
 * shared via the `ResourceShare` table. Admins have an unrestricted view by
 * default but can be put on the same isolation footing as everyone else by
 * flipping the `admin_isolation_enabled` SystemSetting flag.
 */

let cachedAdminIsolation: boolean | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export async function isAdminIsolationEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedAdminIsolation !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedAdminIsolation;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "admin_isolation_enabled" },
  });
  cachedAdminIsolation = setting?.value === "true";
  cachedAt = now;
  return cachedAdminIsolation;
}

export function invalidateOwnershipCache(): void {
  cachedAdminIsolation = null;
  cachedAt = 0;
}

export type OwnershipFilter =
  | null // no restriction (admin + isolation off)
  | { createdById: string } // only own rows
  | { OR: Array<{ createdById: string } | { id: { in: string[] } }> }; // own + shared

/**
 * Build a Prisma where clause that restricts a query to resources the
 * current user owns or has had shared with them. Spread the result into
 * your existing where clause:
 *
 *   const ownership = await ownershipWhere("Influencer", user);
 *   const where = { ...existingFilters, ...(ownership ?? {}) };
 *
 * Returns `null` when the user has unrestricted access (no filter needed).
 */
export async function ownershipWhere(
  resourceType: string,
  user: SessionUser,
): Promise<OwnershipFilter> {
  if (!user?.id) return { createdById: "__no_user__" }; // defensive: deny all
  if (user.role === "Admin" && !(await isAdminIsolationEnabled())) {
    return null;
  }
  const shares = await prisma.resourceShare.findMany({
    where: { userId: user.id, resourceType },
    select: { resourceId: true },
  });
  const sharedIds = shares.map((s) => s.resourceId);
  if (sharedIds.length === 0) {
    return { createdById: user.id };
  }
  return {
    OR: [{ createdById: user.id }, { id: { in: sharedIds } }],
  };
}

/**
 * Assert the current user can access a specific resource. Throws a
 * "Forbidden" error if not. Pass `ownerId` from the row you've already
 * fetched (avoids a second query in the common case).
 */
export async function assertCanAccess(opts: {
  resourceType: string;
  resourceId: string;
  user: SessionUser;
  ownerId: string | null;
  required?: "read" | "write" | "admin";
}): Promise<void> {
  const { resourceType, resourceId, user, ownerId, required = "read" } = opts;

  if (!user?.id) throw new Error("Forbidden: not authenticated");

  if (user.role === "Admin" && !(await isAdminIsolationEnabled())) return;

  if (ownerId && ownerId === user.id) return;

  const share = await prisma.resourceShare.findUnique({
    where: {
      resourceType_resourceId_userId: {
        resourceType,
        resourceId,
        userId: user.id,
      },
    },
    select: { permission: true },
  });
  if (!share) {
    throw new Error(`Forbidden: no access to ${resourceType}`);
  }
  if (required === "read") return;

  const canWrite = share.permission === "write" || share.permission === "admin";
  if (required === "write" && canWrite) return;

  if (required === "admin" && share.permission === "admin") return;

  throw new Error(`Forbidden: insufficient permission`);
}

/**
 * Convenience wrapper: filter a Prisma query result to only the rows
 * the user can access. Use when you can't easily inject the where clause
 * into the original query (rare — prefer ownershipWhere).
 */
export async function filterAccessible<T extends { id: string; createdById: string | null }>(
  resourceType: string,
  user: SessionUser,
  rows: T[],
): Promise<T[]> {
  if (user.role === "Admin" && !(await isAdminIsolationEnabled())) return rows;
  if (!user?.id) return [];
  const shares = await prisma.resourceShare.findMany({
    where: { userId: user.id, resourceType, resourceId: { in: rows.map((r) => r.id) } },
    select: { resourceId: true },
  });
  const sharedIds = new Set(shares.map((s) => s.resourceId));
  return rows.filter(
    (r) => r.createdById === user.id || sharedIds.has(r.id),
  );
}

/**
 * For models whose ownership is inherited from a parent (e.g. Video → Influencer).
 * Returns the where clause to apply on the parent FK.
 *
 * Example for Video table (ownership lives on its Influencer):
 *   const parentWhere = await inheritedOwnershipWhere("Influencer", user);
 *   prisma.video.findMany({ where: { influencer: parentWhere ?? {} } })
 */
export async function inheritedOwnershipWhere(
  parentResourceType: string,
  user: SessionUser,
): Promise<Record<string, unknown> | null> {
  return ownershipWhere(parentResourceType, user);
}
