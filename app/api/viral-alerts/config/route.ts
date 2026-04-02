import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";

export const dynamic = "force-dynamic";

// GET /api/viral-alerts/config — get viral thresholds
export async function GET() {
  await requirePermission("tracking", "read");

  let config = await prisma.viralAlertConfig.findUnique({ where: { id: "default" } });
  if (!config) {
    config = await prisma.viralAlertConfig.create({ data: { id: "default" } });
  }

  return NextResponse.json(config);
}

// PATCH /api/viral-alerts/config — update thresholds
export async function PATCH(request: NextRequest) {
  await requirePermission("tracking", "write");

  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.viewsThreshold !== undefined) data.viewsThreshold = parseInt(body.viewsThreshold);
  if (body.likesThreshold !== undefined) data.likesThreshold = parseInt(body.likesThreshold);
  if (body.commentsThreshold !== undefined) data.commentsThreshold = parseInt(body.commentsThreshold);
  if (body.savesThreshold !== undefined) data.savesThreshold = parseInt(body.savesThreshold);
  if (body.sharesThreshold !== undefined) data.sharesThreshold = parseInt(body.sharesThreshold);
  if (body.enabled !== undefined) data.enabled = body.enabled;

  const config = await prisma.viralAlertConfig.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  });

  return NextResponse.json(config);
}
