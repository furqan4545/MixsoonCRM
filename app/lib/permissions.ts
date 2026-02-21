import { redirect } from "next/navigation";
import { getCurrentUser } from "./rbac";
import { FEATURES, NAV_FEATURE_MAP } from "./permissions-client";

export { FEATURES, NAV_FEATURE_MAP };
export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

/**
 * For server components/pages: require permission or redirect.
 * Use at the top of a page/layout. Redirects to / if forbidden, /login if not authenticated.
 */
export async function requirePermissionOrRedirect(
  feature: string,
  action: string,
): Promise<Awaited<ReturnType<typeof getCurrentUser>>> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.status !== "ACTIVE") {
    redirect("/pending-approval");
  }
  const allowed = (user.permissions ?? []).some(
    (p) => p.feature === feature && p.action === action,
  );
  if (!allowed) {
    redirect("/?forbidden=1");
  }
  return user;
}
