import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/email/:id/pending — manually clear a pending response
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const email = await prisma.emailMessage.findFirst({
    where: {
      id,
      account: { userId: user.id },
      folder: "INBOX",
      influencerId: { not: null },
    },
    include: {
      influencer: { select: { username: true, displayName: true } },
    },
  });

  if (!email || !email.receivedAt) {
    return NextResponse.json(
      { error: "Pending email not found" },
      { status: 404 },
    );
  }

  const rule = await prisma.alertRule.findFirst({
    where: { type: "EMAIL_NO_REPLY_US" },
    select: { id: true },
  });

  if (!rule) {
    return NextResponse.json(
      { error: "Pending response rule not configured" },
      { status: 500 },
    );
  }

  const now = new Date();
  const daysSince = Math.floor(
    (Date.now() - email.receivedAt.getTime()) / 86_400_000,
  );
  const displayName =
    email.influencer?.displayName || `@${email.influencer?.username}`;

  const existing = await prisma.alertEvent.findFirst({
    where: {
      ruleId: rule.id,
      emailId: email.id,
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.alertEvent.update({
      where: { id: existing.id },
      data: {
        status: "DISMISSED",
        dismissedAt: now,
      },
    });
  } else {
    await prisma.alertEvent.create({
      data: {
        ruleId: rule.id,
        status: "DISMISSED",
        emailId: email.id,
        influencerId: email.influencerId ?? undefined,
        title: `We haven't replied to ${displayName}`,
        message: `Received ${daysSince} days ago. Subject: "${email.subject}"`,
        daysSince,
        dismissedAt: now,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
