import { NextResponse } from "next/server";
import {
  parseStoredSignature,
  serializeStoredSignature,
} from "@/app/lib/email-signature";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

const MAX_IMAGE_DATA_URL_LENGTH = 3_000_000;
const DATA_IMAGE_REGEX =
  /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\n\r]+$/;

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
  const parsed = parseStoredSignature(rows[0]?.signature ?? null);
  return NextResponse.json({
    text: parsed.text,
    imageDataUrl: parsed.imageDataUrl,
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
  const text = typeof body.text === "string" ? body.text : "";
  const imageDataUrl =
    typeof body.imageDataUrl === "string" ? body.imageDataUrl : null;

  if (imageDataUrl && !DATA_IMAGE_REGEX.test(imageDataUrl)) {
    return NextResponse.json(
      { error: "Invalid signature image" },
      { status: 400 },
    );
  }
  if (imageDataUrl && imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return NextResponse.json(
      { error: "Signature image is too large" },
      { status: 400 },
    );
  }

  const stored = serializeStoredSignature({ text, imageDataUrl });
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
