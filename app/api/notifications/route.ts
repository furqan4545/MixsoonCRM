import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../lib/prisma";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 500;

export async function GET(request: NextRequest) {
  try {
    await requirePermission("notifications", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
    );
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: unreadOnly ? { read: false } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({ where: { read: false } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error("[GET /api/notifications]", error);
    return NextResponse.json(
      { notifications: [], unreadCount: 0, error: "Failed to load notifications" },
      { status: 200 },
    );
  }
}

export async function PATCH() {
  try {
    await requirePermission("notifications", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await prisma.notification.updateMany({
      where: {},
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/notifications]", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requirePermission("notifications", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    await prisma.notification.deleteMany({});
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/notifications]", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
