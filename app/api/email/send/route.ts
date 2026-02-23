import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";
import { getSmtpTransport } from "@/app/lib/email";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "No email account connected" }, { status: 404 });
  }

  const { to, cc, subject, bodyHtml, bodyText, influencerId, inReplyTo } =
    await req.json();

  if (!to || !Array.isArray(to) || to.length === 0) {
    return NextResponse.json({ error: "At least one recipient is required" }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  const transport = getSmtpTransport(account);

  try {
    const info = await transport.sendMail({
      from: account.displayName
        ? `"${account.displayName}" <${account.emailAddress}>`
        : account.emailAddress,
      to: to.join(", "),
      cc: cc?.join(", ") || undefined,
      subject,
      html: bodyHtml || undefined,
      text: bodyText || undefined,
      inReplyTo: inReplyTo || undefined,
    });

    const email = await prisma.emailMessage.create({
      data: {
        accountId: account.id,
        messageId: info.messageId || undefined,
        inReplyTo: inReplyTo || undefined,
        from: account.emailAddress,
        to,
        cc: cc ?? [],
        subject,
        bodyHtml: bodyHtml || undefined,
        bodyText: bodyText || undefined,
        folder: "SENT",
        isRead: true,
        sentAt: new Date(),
        influencerId: influencerId || undefined,
        threadId: inReplyTo || info.messageId || undefined,
      },
    });

    transport.close();
    return NextResponse.json({ id: email.id, messageId: info.messageId });
  } catch (err: unknown) {
    transport.close();
    const message = err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
