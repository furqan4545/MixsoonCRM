import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/lib/rbac";
import { testSmtpConnection, testImapConnection } from "@/app/lib/email";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { smtpHost, smtpPort, imapHost, imapPort, username, password } =
    await req.json();

  if (!smtpHost || !imapHost || !username || !password) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const [smtp, imap] = await Promise.all([
    testSmtpConnection(smtpHost, Number(smtpPort), username, password),
    testImapConnection(imapHost, Number(imapPort), username, password),
  ]);

  return NextResponse.json({ smtp, imap });
}
