import { type NextRequest, NextResponse } from "next/server";
import {
  buildAttachmentUrl,
  deleteEmailAttachments,
  listEmailAttachments,
} from "@/app/lib/email-attachments";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const email = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
    include: {
      influencer: { select: { id: true, username: true, avatarUrl: true } },
    },
  });

  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachments = (
    await listEmailAttachments(email.accountId, email.id)
  ).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: buildAttachmentUrl(email.id, attachment.id),
    isImage: attachment.mimeType.startsWith("image/"),
    isVideo: attachment.mimeType.startsWith("video/"),
  }));

  if (!email.isRead) {
    await prisma.emailMessage.update({
      where: { id },
      data: { isRead: true },
    });
  }

  // Fetch thread messages if this email has a threadId
  let threadMessages: typeof email[] = [];

  if (email.threadId) {
    threadMessages = await prisma.emailMessage.findMany({
      where: {
        accountId: email.accountId,
        threadId: email.threadId,
        id: { not: email.id },
      },
      include: {
        influencer: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: [{ receivedAt: "asc" }, { sentAt: "asc" }, { createdAt: "asc" }],
    });
  }

  // Fetch email alerts for all messages in the thread
  const allMessageIds = [email.id, ...threadMessages.map((m) => m.id)];
  const emailAlerts = await prisma.emailAlert.findMany({
    where: { emailMessageId: { in: allMessageIds } },
    include: { template: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    ...email,
    isRead: true,
    attachments,
    threadMessages,
    emailAlerts,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const allowed: Record<string, unknown> = {};
  if (typeof body.isRead === "boolean") allowed.isRead = body.isRead;
  if (typeof body.isStarred === "boolean") allowed.isStarred = body.isStarred;
  if (body.folder) allowed.folder = body.folder;

  const updated = await prisma.emailMessage.update({
    where: { id },
    data: allowed,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const existing = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.folder === "TRASH") {
    await prisma.emailMessage.delete({ where: { id } });
    await deleteEmailAttachments(existing.accountId, existing.id);
  } else {
    await prisma.emailMessage.update({
      where: { id },
      data: { folder: "TRASH" },
    });
  }

  return NextResponse.json({ ok: true });
}
