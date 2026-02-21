import { auth } from "@/auth";
import { prisma } from "./prisma";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  status?: string;
  role?: string;
  permissions?: { feature: string; action: string }[];
};

/**
 * Get the current user from the Auth.js session (for use in API routes / server components).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id ?? "",
    email: u.email ?? null,
    name: u.name ?? null,
    status: u.status,
    role: u.role,
    permissions: u.permissions ?? [],
  };
}

/**
 * Check if the current session user has a specific permission.
 */
export async function hasSessionPermission(
  feature: string,
  action: string,
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return false;
  return (user.permissions ?? []).some(
    (p) => p.feature === feature && p.action === action,
  );
}

/**
 * Require a specific permission or throw. Use in API routes for protection.
 * Throws if not authenticated, account not active, or missing permission.
 */
export async function requirePermission(
  feature: string,
  action: string,
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (user.status !== "ACTIVE") throw new Error("Account not active");
  const allowed = (user.permissions ?? []).some(
    (p) => p.feature === feature && p.action === action,
  );
  if (!allowed) {
    throw new Error(`Forbidden: missing ${feature}:${action} permission`);
  }
  return user;
}

/**
 * Check if a user (by email) has a specific permission. Use when you need to check
 * permission for a user other than the current session (e.g. background jobs).
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
 * Get a user's role name by email.
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
