import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { invalidateOwnershipCache } from "@/app/lib/ownership";

// GET /api/system/isolation — read the admin-isolation flag
export async function GET() {
  try {
    await requirePermission("users", "read");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: "admin_isolation_enabled" },
  });
  return NextResponse.json({
    adminIsolationEnabled: setting?.value === "true",
  });
}

// PATCH /api/system/isolation — flip the admin-isolation flag
export async function PATCH(request: Request) {
  let currentUser;
  try {
    currentUser = await requirePermission("users", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }
  if (currentUser.role !== "Admin") {
    return NextResponse.json(
      { error: "Only Admin role can change isolation settings" },
      { status: 403 },
    );
  }

  const body = await request.json();
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "`enabled` must be a boolean" },
      { status: 400 },
    );
  }

  await prisma.systemSetting.upsert({
    where: { key: "admin_isolation_enabled" },
    create: {
      key: "admin_isolation_enabled",
      value: body.enabled ? "true" : "false",
    },
    update: { value: body.enabled ? "true" : "false" },
  });

  invalidateOwnershipCache();

  await prisma.notification.create({
    data: {
      type: "system_setting_changed",
      status: "info",
      title: `Admin isolation ${body.enabled ? "enabled" : "disabled"}`,
      message: `${currentUser.name ?? currentUser.email ?? "user"} ${body.enabled ? "enabled" : "disabled"} per-user isolation for admin accounts.`,
      userId: currentUser.id,
    },
  }).catch(() => {});

  return NextResponse.json({
    adminIsolationEnabled: body.enabled,
  });
}
