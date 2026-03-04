import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

/**
 * GET /api/email/pending-responses
 * Returns emails from influencers that WE haven't replied to yet.
 * Logic: Find the latest INBOX email per influencer where no SENT email
 * exists after receivedAt.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) return NextResponse.json({ items: [], count: 0 });

  try {
    // Find latest INBOX email per influencer where we haven't replied
    const inboxEmails = await prisma.emailMessage.findMany({
      where: {
        accountId: account.id,
        folder: "INBOX",
        influencerId: { not: null },
      },
      orderBy: { receivedAt: "desc" },
      distinct: ["influencerId"],
      include: {
        influencer: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });

    const pendingItems: Array<{
      id: string;
      from: string;
      subject: string;
      receivedAt: string | null;
      daysSince: number;
      influencer: {
        id: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
      };
    }> = [];

    for (const email of inboxEmails) {
      if (!email.influencerId || !email.receivedAt) continue;

      // Check if we sent any email to this influencer after the inbox date
      const ourReply = await prisma.emailMessage.findFirst({
        where: {
          accountId: account.id,
          influencerId: email.influencerId,
          folder: "SENT",
          sentAt: { gt: email.receivedAt },
        },
        select: { id: true },
      });

      if (ourReply) continue; // We already replied

      const daysSince = Math.floor(
        (Date.now() - email.receivedAt.getTime()) / 86_400_000,
      );

      pendingItems.push({
        id: email.id,
        from: email.from,
        subject: email.subject,
        receivedAt: email.receivedAt.toISOString(),
        daysSince,
        influencer: {
          id: email.influencer!.id,
          username: email.influencer!.username,
          displayName: email.influencer!.displayName,
          avatarUrl: email.influencer!.avatarUrl,
        },
      });
    }

    // Sort by daysSince descending (oldest unreplied first)
    pendingItems.sort((a, b) => b.daysSince - a.daysSince);

    return NextResponse.json({
      items: pendingItems,
      count: pendingItems.length,
    });
  } catch (error) {
    console.error("[GET /api/email/pending-responses]", error);
    return NextResponse.json(
      { error: "Failed to fetch pending responses" },
      { status: 500 },
    );
  }
}
