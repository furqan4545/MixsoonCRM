import { NextResponse } from "next/server";
import { encrypt } from "@/app/lib/crypto";
import { deleteAllAccountEmailAttachments } from "@/app/lib/email-attachments";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (!account) return NextResponse.json(null);

  let signature: string | null = null;
  try {
    const rows = await prisma.$queryRaw<Array<{ signature: string | null }>>`
      SELECT "signature"
      FROM "EmailAccount"
      WHERE "id" = ${account.id}
      LIMIT 1
    `;
    signature = rows[0]?.signature ?? null;
  } catch {
    signature = null;
  }

  return NextResponse.json({ ...account, signature });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      emailAddress,
      smtpHost,
      smtpPort,
      imapHost,
      imapPort,
      username,
      password,
      signature,
    } = body;

    if (!emailAddress || !smtpHost || !imapHost) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const authUsername = username || emailAddress;
    const displayName = user.name || emailAddress.split("@")[0];
    const hasSignatureField = typeof signature === "string";
    const normalizedSignature = hasSignatureField
      ? signature.trim()
      : undefined;

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
      if (hasSignatureField) {
        await setAccountSignature(account.id, normalizedSignature || null);
      }
      return NextResponse.json({ id: account.id });
    }

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
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
    if (hasSignatureField) {
      await setAccountSignature(account.id, normalizedSignature || null);
    }

    return NextResponse.json({ id: account.id });
  } catch (err) {
    console.error("[email] account save error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to save account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function setAccountSignature(
  accountId: string,
  signature: string | null,
) {
  try {
    await prisma.$executeRaw`
      UPDATE "EmailAccount"
      SET "signature" = ${signature}
      WHERE "id" = ${accountId}
    `;
  } catch (err) {
    console.warn("[email] failed to persist signature via SQL fallback:", err);
  }
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
