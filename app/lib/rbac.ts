import { prisma } from "./prisma";

/**
 * Check if a user has a specific permission.
 * Usage: const allowed = await hasPermission("admin@mixsoon.com", "data-scraper", "write");
 */
export async function hasPermission(
  userEmail: string,
  feature: string,
  action: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: {
      role: {
        include: { permissions: true },
      },
    },
  });

  if (!user) return false;

  return user.role.permissions.some(
    (p) => p.feature === feature && p.action === action,
  );
}

/**
 * Get a user's role name.
 */
export async function getUserRole(
  userEmail: string,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { role: true },
  });

  return user?.role.name ?? null;
}

/**
 * Require a specific permission or throw.
 * Use in API routes for protection.
 */
export async function requirePermission(
  userEmail: string,
  feature: string,
  action: string,
): Promise<void> {
  const allowed = await hasPermission(userEmail, feature, action);
  if (!allowed) {
    throw new Error(
      `Forbidden: user ${userEmail} lacks ${feature}:${action} permission`,
    );
  }
}
