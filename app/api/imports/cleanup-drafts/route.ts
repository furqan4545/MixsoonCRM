import { NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../../lib/prisma";

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// POST /api/imports/cleanup-drafts — Delete DRAFT imports older than 24 hours
// Can be called via a cron job or on page load.
export async function POST() {
  try {
    await requirePermission("imports", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cutoff = new Date(Date.now() - DRAFT_TTL_MS);

  const stale = await prisma.import.findMany({
    where: { status: "DRAFT", createdAt: { lt: cutoff } },
    select: { id: true },
  });

  if (stale.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  const ids = stale.map((i) => i.id);

  const influencers = await prisma.influencer.findMany({
    where: { importId: { in: ids } },
    select: { id: true },
  });
  const influencerIds = influencers.map((i) => i.id);

  if (influencerIds.length > 0) {
    await prisma.video.deleteMany({
      where: { influencerId: { in: influencerIds } },
    });
    await prisma.influencer.deleteMany({
      where: { id: { in: influencerIds } },
    });
  }

  await prisma.import.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ deleted: stale.length });
}
