import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { prisma } from "@/app/lib/prisma";
import { encrypt } from "@/app/lib/crypto";

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
      username: true,
      lastSyncAt: true,
    },
  });

  return NextResponse.json(account);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    emailAddress,
    displayName,
    smtpHost,
    smtpPort,
    imapHost,
    imapPort,
    username,
    password,
  } = body;

  if (!emailAddress || !smtpHost || !imapHost || !username) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const existing = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });

  if (existing) {
    const data: Record<string, unknown> = {
      emailAddress,
      displayName: displayName || null,
      smtpHost,
      smtpPort: Number(smtpPort),
      imapHost,
      imapPort: Number(imapPort),
      username,
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
      displayName: displayName || null,
      smtpHost,
      smtpPort: Number(smtpPort),
      imapHost,
      imapPort: Number(imapPort),
      username,
      encryptedPass: encrypt(password),
    },
  });

  return NextResponse.json({ id: account.id });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.emailMessage.deleteMany({
    where: { account: { userId: user.id } },
  });

  await prisma.emailAccount.deleteMany({
    where: { userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
