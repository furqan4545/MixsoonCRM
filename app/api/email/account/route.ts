import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";
import {
  deleteAllAccountEmailAttachments,
} from "@/app/lib/email-attachments";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      emailAddress: true,
      displayName: true,
      smtpHost: true,
      smtpPort: true,
      imapHost: true,
      imapPort: true,
      lastSyncAt: true,
    },
  });

  return NextResponse.json(account);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { emailAddress, smtpHost, smtpPort, imapHost, imapPort, username, password } = body;

    if (!emailAddress || !smtpHost || !imapHost) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const authUsername = username || emailAddress;
    const displayName = user.name || emailAddress.split("@")[0];

    const existing = await prisma.emailAccount.findUnique({
      where: { userId: user.id },
    });

    if (existing) {
      const data: Record<string, unknown> = {
        emailAddress,
        displayName,
        smtpHost,
        smtpPort: Number(smtpPort),
        imapHost,
        imapPort: Number(imapPort),
        username: authUsername,
      };
      if (password) {
        data.encryptedPass = encrypt(password);
      }

      const account = await prisma.emailAccount.update({
        where: { userId: user.id },
        data,
      });
      return NextResponse.json({ id: account.id });
    }

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const account = await prisma.emailAccount.create({
      data: {
        userId: user.id,
        emailAddress,
        displayName,
        smtpHost,
        smtpPort: Number(smtpPort),
        imapHost,
        imapPort: Number(imapPort),
        username: authUsername,
        encryptedPass: encrypt(password),
      },
    });

    return NextResponse.json({ id: account.id });
  } catch (err) {
    console.error("[email] account save error:", err);
    const message = err instanceof Error ? err.message : "Failed to save account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountIds = (
    await prisma.emailAccount.findMany({
      where: { userId: user.id },
      select: { id: true },
    })
  ).map((a) => a.id);

  await prisma.emailMessage.deleteMany({
    where: { account: { userId: user.id } },
  });

  await prisma.emailAccount.deleteMany({
    where: { userId: user.id },
  });

  await Promise.all(
    accountIds.map((accountId) => deleteAllAccountEmailAttachments(accountId)),
  );

  return NextResponse.json({ ok: true });
}
