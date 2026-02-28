import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return NextResponse.json(
      { error: "No email account connected" },
      { status: 404 },
    );
  }

  const { to, cc, subject, bodyHtml, bodyText, influencerId } =
    await req.json();

  const draft = await prisma.emailMessage.create({
    data: {
      accountId: account.id,
      from: account.emailAddress,
      to: to ?? [],
      cc: cc ?? [],
      subject: subject ?? "",
      bodyHtml: bodyHtml || undefined,
      bodyText: bodyText || undefined,
      folder: "DRAFTS",
      isRead: true,
      influencerId: influencerId || undefined,
    },
  });

  return NextResponse.json({ id: draft.id });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, to, cc, subject, bodyHtml, bodyText } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Draft ID required" }, { status: 400 });
  }

  const existing = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id }, folder: "DRAFTS" },
  });
  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const draft = await prisma.emailMessage.update({
    where: { id },
    data: {
      to: to ?? existing.to,
      cc: cc ?? existing.cc,
      subject: subject ?? existing.subject,
      bodyHtml: bodyHtml !== undefined ? bodyHtml : existing.bodyHtml,
      bodyText: bodyText !== undefined ? bodyText : existing.bodyText,
    },
  });

  return NextResponse.json({ id: draft.id });
}
