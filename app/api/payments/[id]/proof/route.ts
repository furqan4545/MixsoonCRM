import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { uploadToGcs } from "@/app/lib/gcs-upload";
import { getSmtpTransport } from "@/app/lib/email";

const MAX_FILES = 8;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20 MB
const MAX_TOTAL_BYTES = 40 * 1024 * 1024; // 40 MB
const ALLOWED_TYPES_PREFIX = ["image/", "application/pdf"];

type ProofFile = {
  gcsPath: string;
  name: string;
  size: number;
  type: string;
};

// POST /api/payments/[id]/proof — team member uploads proof and emails to influencer.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requirePermission("payments", "write");
  const { id } = await params;

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      influencer: { select: { id: true, username: true, displayName: true, email: true, secondaryEmails: true } },
      campaign: { select: { name: true } },
    },
  });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  if (!payment.influencer.email) {
    return NextResponse.json(
      { error: "Influencer has no email on file" },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const message = String(formData.get("message") ?? "").trim();

  if (files.length === 0) {
    return NextResponse.json(
      { error: "At least one file is required" },
      { status: 400 },
    );
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 },
    );
  }

  let total = 0;
  for (const f of files) {
    if (f.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `${f.name} exceeds 20 MB` },
        { status: 400 },
      );
    }
    if (!ALLOWED_TYPES_PREFIX.some((prefix) => f.type.startsWith(prefix))) {
      return NextResponse.json(
        { error: `${f.name} is not an image or PDF` },
        { status: 400 },
      );
    }
    total += f.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Total upload size exceeds 40 MB" },
      { status: 400 },
    );
  }

  const senderAccount = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!senderAccount) {
    return NextResponse.json(
      { error: "Connect your email account in Settings first" },
      { status: 400 },
    );
  }

  // Upload all files to GCS first; collect metadata + buffers for email attachments.
  const proofFiles: ProofFile[] = [];
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer());
    // Object path: payments/{paymentId}/proof/{timestamp}-{filename}
    const safeName = f.name.replace(/[^\w.-]+/g, "_");
    const objectPath = `payments/${payment.id}/proof/${Date.now()}-${safeName}`;
    const gcsPath = await uploadToGcs({
      buffer,
      objectPath,
      contentType: f.type || "application/octet-stream",
    });
    if (!gcsPath) {
      return NextResponse.json(
        { error: "Upload storage is not configured" },
        { status: 500 },
      );
    }
    proofFiles.push({ gcsPath, name: f.name, size: f.size, type: f.type });
    attachments.push({
      filename: f.name,
      content: buffer,
      contentType: f.type || "application/octet-stream",
    });
  }

  const now = new Date();
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      proofSentAt: now,
      proofSentByUserId: user.id,
      proofSentMessage: message || null,
      proofFiles: proofFiles as unknown as object,
    },
    include: {
      influencer: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
      campaign: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      confirmedByUser: { select: { id: true, name: true, email: true } },
      proofSentByUser: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      influencerId: payment.influencerId,
      type: "payment_proof_sent",
      title: "Proof of payment sent",
      detail: `${user.email} sent ${proofFiles.length} file${proofFiles.length > 1 ? "s" : ""} for ${payment.amount.toLocaleString()} ${payment.currency}`,
    },
  });

  const greetingName = payment.influencer.displayName || `@${payment.influencer.username}`;
  const transport = getSmtpTransport(senderAccount);
  try {
    await transport.sendMail({
      from: `"MIXSOON Payments" <${senderAccount.emailAddress}>`,
      to: payment.influencer.email,
      cc:
        payment.influencer.secondaryEmails.length > 0
          ? payment.influencer.secondaryEmails
          : undefined,
      subject: `Proof of payment — ${payment.amount.toLocaleString()} ${payment.currency}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="margin: 0 0 16px 0;">Proof of payment</h2>
          <p>Hi ${greetingName},</p>
          <p>As requested, the proof of payment is attached to this email.</p>
          ${message ? `<div style="background: #f0f4ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 4px; margin: 16px 0;"><p style="margin: 0; font-size: 14px;">${message.replace(/</g, "&lt;")}</p></div>` : ""}
          <div style="background: #f9f9f9; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666;">Amount</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${payment.amount.toLocaleString()} ${payment.currency}</td></tr>
              <tr><td style="padding: 6px 0; color: #666;">Status</td><td style="padding: 6px 0; text-align: right;">${payment.status}</td></tr>
              ${payment.campaign ? `<tr><td style="padding: 6px 0; color: #666;">Campaign</td><td style="padding: 6px 0; text-align: right;">${payment.campaign.name}</td></tr>` : ""}
              <tr><td style="padding: 6px 0; color: #666;">Files</td><td style="padding: 6px 0; text-align: right;">${proofFiles.length}</td></tr>
            </table>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">— MIXSOON Team</p>
        </div>
      `,
      attachments,
    });
  } finally {
    transport.close();
  }

  return NextResponse.json({
    success: true,
    proofSentAt: now,
    filesCount: proofFiles.length,
    // Full updated row so the dashboard can merge into `selected` without
    // a second round-trip — matches the PATCH endpoint's response shape.
    payment: {
      ...updated,
      accountNumber: undefined,
      iban: undefined,
      routingNumber: undefined,
      confirmToken: undefined,
    },
  });
}
