import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import {
  testSmtpConnection,
  testImapConnection,
  testPop3Connection,
} from "@/app/lib/email";
import { prisma } from "@/app/lib/prisma";
import { decrypt } from "@/app/lib/crypto";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { smtpHost, smtpPort, imapHost, imapPort, username, password } =
    await req.json();

  if (!smtpHost || !imapHost || !username) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const isHiworksSmtpOnly =
    (typeof smtpHost === "string" && smtpHost.includes("hiworks.com")) ||
    (typeof imapHost === "string" && imapHost.includes("pop3s.hiworks.com"));

  let authPassword = password as string | undefined;
  if (!authPassword) {
    const account = await prisma.emailAccount.findUnique({
      where: { userId: user.id },
      select: { encryptedPass: true },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Password is required for unconnected account" },
        { status: 400 },
      );
    }

    try {
      authPassword = decrypt(account.encryptedPass);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt saved password" },
        { status: 500 },
      );
    }
  }

  const smtp = await testSmtpConnection(
    smtpHost,
    Number(smtpPort),
    username,
    authPassword,
  );
  if (isHiworksSmtpOnly) {
    const pop3 = await testPop3Connection(
      imapHost,
      Number(imapPort),
      username,
      authPassword,
    );
    return NextResponse.json({ smtp, imap: pop3 });
  }

  const imap = await testImapConnection(
    imapHost,
    Number(imapPort),
    username,
    authPassword,
  );

  return NextResponse.json({ smtp, imap });
}
