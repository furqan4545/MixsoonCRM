import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) return NextResponse.json({});

  const rows = await prisma.emailMessage.groupBy({
    by: ["folder"],
    where: { accountId: account.id, isRead: false },
    _count: { id: true },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.folder] = row._count.id;
  }

  // Count pending responses: INBOX emails from influencers where we haven't replied
  try {
    const clearedEvents = await prisma.alertEvent.findMany({
      where: {
        rule: { type: "EMAIL_NO_REPLY_US" },
        status: { in: ["DISMISSED", "RESOLVED"] },
        emailId: { not: null },
      },
      select: { emailId: true },
    });
    const clearedIds = new Set(
      clearedEvents
        .map((event) => event.emailId)
        .filter((emailId): emailId is string => Boolean(emailId)),
    );

    const inboxEmails = await prisma.emailMessage.findMany({
      where: {
        accountId: account.id,
        folder: "INBOX",
        influencerId: { not: null },
      },
      orderBy: { receivedAt: "desc" },
      distinct: ["influencerId"],
      select: { influencerId: true, receivedAt: true },
    });

    let pendingCount = 0;
    for (const email of inboxEmails) {
      if (!email.influencerId || !email.receivedAt) continue;
      if (clearedIds.has(email.id)) continue;
      const ourReply = await prisma.emailMessage.findFirst({
        where: {
          accountId: account.id,
          influencerId: email.influencerId,
          folder: "SENT",
          sentAt: { gt: email.receivedAt },
        },
        select: { id: true },
      });
      if (!ourReply) pendingCount++;
    }
    counts.PENDING_RESPONSE = pendingCount;
  } catch {
    // Non-critical, don't fail the whole counts request
  }

  return NextResponse.json(counts);
}
