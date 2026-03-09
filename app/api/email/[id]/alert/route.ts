import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string }> };

// GET /api/email/:id/alert — Fetch active alert for this email
export async function GET(
  _req: NextRequest,
  { params }: Params,
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const email = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
    select: { id: true },
  });
  if (!email)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const alert = await prisma.emailAlert.findFirst({
    where: {
      emailMessageId: id,
      status: { in: ["WAITING", "TRIGGERED"] },
    },
    include: { template: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ alert });
}

// POST /api/email/:id/alert — Attach alert to an already-sent email
export async function POST(
  req: NextRequest,
  { params }: Params,
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const email = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
    include: { account: { select: { emailAddress: true } } },
  });
  if (!email)
    return NextResponse.json(
      { error: "Email not found" },
      { status: 404 },
    );

  // Verify this is an email sent by us (by folder or by from-address match)
  const isSentByUs =
    email.folder === "SENT" ||
    email.from.toLowerCase() === email.account.emailAddress.toLowerCase();
  if (!isSentByUs)
    return NextResponse.json(
      { error: "Can only attach alerts to emails you sent" },
      { status: 400 },
    );
  if (!email.sentAt)
    return NextResponse.json(
      { error: "Email has no sent date" },
      { status: 400 },
    );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const thresholdDays = Number(body.thresholdDays ?? 0);
  if (thresholdDays <= 0)
    return NextResponse.json(
      { error: "thresholdDays required" },
      { status: 400 },
    );

  // Cancel any existing WAITING alert for this email
  await prisma.emailAlert.updateMany({
    where: { emailMessageId: id, status: "WAITING" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  // Get default template from the alert rule
  const alertRule = await prisma.alertRule.findFirst({
    where: { type: "EMAIL_NO_REPLY_INFLUENCER" },
    select: { templateId: true },
  });

  const triggerAt = new Date(email.sentAt);
  triggerAt.setDate(triggerAt.getDate() + thresholdDays);

  const alert = await prisma.emailAlert.create({
    data: {
      emailMessageId: id,
      influencerId: email.influencerId ?? undefined,
      thresholdDays,
      templateId: alertRule?.templateId ?? undefined,
      triggerAt,
    },
  });

  return NextResponse.json({ alert }, { status: 201 });
}

// DELETE /api/email/:id/alert — Cancel/remove alert from email
export async function DELETE(
  _req: NextRequest,
  { params }: Params,
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const email = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
    select: { id: true },
  });
  if (!email)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await prisma.emailAlert.updateMany({
    where: { emailMessageId: id, status: "WAITING" },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return NextResponse.json({ cancelled: result.count });
}
