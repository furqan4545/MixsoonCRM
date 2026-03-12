import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

// POST /api/portal/track-open — Public (token-based): track when influencer opens contract
export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const tokenRecord = await prisma.onboardingToken.findUnique({
      where: { token },
      include: {
        influencer: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });

    if (!tokenRecord || tokenRecord.type !== "CONTRACT") {
      return NextResponse.json({ ok: true }); // Silently ignore invalid tokens
    }

    // Already opened or already signed — skip
    if (tokenRecord.openedAt || tokenRecord.usedAt) {
      return NextResponse.json({ ok: true });
    }

    const influencerName =
      tokenRecord.influencer.displayName || tokenRecord.influencer.username;

    // Mark as opened (dedup future requests)
    await prisma.onboardingToken.update({
      where: { id: tokenRecord.id },
      data: { openedAt: new Date() },
    });

    // Create bell notification for admins
    await prisma.notification.create({
      data: {
        type: "contract_opened",
        status: "info",
        title: "Contract opened",
        message: `${influencerName} opened the contract`,
      },
    });

    // Activity log
    await prisma.activityLog.create({
      data: {
        influencerId: tokenRecord.influencerId,
        type: "contract",
        title: "Contract opened",
        detail: `${influencerName} opened the contract signing link`,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/portal/track-open]", error);
    return NextResponse.json({ ok: true }); // Don't fail the page load
  }
}
