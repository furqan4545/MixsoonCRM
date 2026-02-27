import { NextResponse } from "next/server";
import { signatureToHtml } from "@/app/lib/email-signature";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

const MAX_SIGNATURE_HTML_LENGTH = 3_000_000;

async function getAccountIdForUser(userId: string): Promise<string | null> {
  const account = await prisma.emailAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  return account?.id ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = await getAccountIdForUser(user.id);
  if (!accountId) {
    return NextResponse.json(
      { error: "No email account connected" },
      { status: 404 },
    );
  }

  const rows = await prisma.$queryRaw<Array<{ signature: string | null }>>`
    SELECT "signature"
    FROM "EmailAccount"
    WHERE "id" = ${accountId}
    LIMIT 1
  `;
  const html = signatureToHtml(rows[0]?.signature ?? null);
  return NextResponse.json({
    html,
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = await getAccountIdForUser(user.id);
  if (!accountId) {
    return NextResponse.json(
      { error: "No email account connected" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const html = typeof body.html === "string" ? body.html : "";
  const sanitizedHtml = sanitizeSignatureHtml(html);

  if (sanitizedHtml.length > MAX_SIGNATURE_HTML_LENGTH) {
    return NextResponse.json(
      { error: "Signature is too large" },
      { status: 400 },
    );
  }

  const hasContent =
    sanitizedHtml.replace(/<[^>]+>/g, "").trim().length > 0 ||
    /<img\b/i.test(sanitizedHtml);
  const stored = hasContent ? sanitizedHtml : null;
  await prisma.$executeRaw`
    UPDATE "EmailAccount"
    SET "signature" = ${stored}
    WHERE "id" = ${accountId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = await getAccountIdForUser(user.id);
  if (!accountId) {
    return NextResponse.json(
      { error: "No email account connected" },
      { status: 404 },
    );
  }

  await prisma.$executeRaw`
    UPDATE "EmailAccount"
    SET "signature" = NULL
    WHERE "id" = ${accountId}
  `;
  return NextResponse.json({ ok: true });
}

function sanitizeSignatureHtml(rawHtml: string): string {
  const trimmed = rawHtml.trim();
  if (!trimmed) return "";

  return trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, "");
}
