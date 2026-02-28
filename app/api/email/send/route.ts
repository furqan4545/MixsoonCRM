import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSmtpTransport } from "@/app/lib/email";
import {
  deleteEmailAttachments,
  type PersistableAttachment,
  persistEmailAttachments,
} from "@/app/lib/email-attachments";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const INLINE_IMAGE_REGEX =
  /<img\b([^>]*?)src=(["'])(data:image\/[a-zA-Z0-9.+-]+;base64,[^"']+)\2([^>]*)>/gi;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) {
    return NextResponse.json(
      { error: "No email account connected" },
      { status: 404 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  let to: string[] = [];
  let cc: string[] = [];
  let subject = "";
  let bodyHtml = "";
  let bodyText = "";
  let influencerId = "";
  let inReplyTo = "";
  let uploadAttachmentFiles: File[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    to = form
      .getAll("to")
      .map((v) => String(v).trim())
      .filter(Boolean);
    cc = form
      .getAll("cc")
      .map((v) => String(v).trim())
      .filter(Boolean);
    subject = String(form.get("subject") ?? "").trim();
    bodyHtml = String(form.get("bodyHtml") ?? "");
    bodyText = String(form.get("bodyText") ?? "");
    influencerId = String(form.get("influencerId") ?? "");
    inReplyTo = String(form.get("inReplyTo") ?? "");
    uploadAttachmentFiles = form
      .getAll("attachments")
      .filter((v): v is File => v instanceof File);
  } else {
    const body = await req.json();
    to = Array.isArray(body.to)
      ? body.to.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    cc = Array.isArray(body.cc)
      ? body.cc.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    subject = String(body.subject ?? "").trim();
    bodyHtml = String(body.bodyHtml ?? "");
    bodyText = String(body.bodyText ?? "");
    influencerId = String(body.influencerId ?? "");
    inReplyTo = String(body.inReplyTo ?? "");
  }

  if (to.length === 0) {
    return NextResponse.json(
      { error: "At least one recipient is required" },
      { status: 400 },
    );
  }
  if (!subject) {
    return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  }

  let totalAttachmentBytes = 0;
  const smtpAttachments: Array<{
    filename: string;
    contentType: string;
    content: Buffer;
    cid?: string;
    contentDisposition?: "inline" | "attachment";
  }> = [];
  const persistableAttachments: PersistableAttachment[] = [];

  for (const file of uploadAttachmentFiles) {
    if (file.size <= 0) continue;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      return NextResponse.json(
        { error: `Unsupported attachment type: ${file.type || file.name}` },
        { status: 400 },
      );
    }

    totalAttachmentBytes += file.size;
    if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        { error: "Attachments exceed 20 MB total limit" },
        { status: 400 },
      );
    }

    const content = Buffer.from(await file.arrayBuffer());
    smtpAttachments.push({
      filename: file.name || "attachment",
      contentType: file.type || "application/octet-stream",
      content,
      contentDisposition: "attachment",
    });
    persistableAttachments.push({
      filename: file.name || "attachment",
      mimeType: file.type || "application/octet-stream",
      content,
    });
  }

  let htmlForSend = bodyHtml || "";
  try {
    if (htmlForSend) {
      let inlineIndex = 0;
      htmlForSend = htmlForSend.replace(
        INLINE_IMAGE_REGEX,
        (full, before, quote, dataUri, after) => {
          const parsed = parseDataImageUri(dataUri);
          if (!parsed) return full as string;

          const cid = `inline-${Date.now()}-${inlineIndex}@mixsoon`;
          inlineIndex += 1;
          totalAttachmentBytes += parsed.buffer.length;
          if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
            throw new Error("Attachments exceed 20 MB total limit");
          }

          smtpAttachments.push({
            filename: `inline-${inlineIndex}.${extensionForMime(parsed.mime)}`,
            contentType: parsed.mime,
            content: parsed.buffer,
            cid,
            contentDisposition: "inline",
          });

          return `<img${before}src=${quote}cid:${cid}${quote}${after}>`;
        },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid inline image";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const transport = getSmtpTransport(account);
  const emailId = crypto.randomUUID();
  let attachmentsPersisted = false;

  if (persistableAttachments.length > 0) {
    try {
      await persistEmailAttachments(
        account.id,
        emailId,
        persistableAttachments,
      );
      attachmentsPersisted = true;
    } catch (persistErr) {
      console.error("[email-send] Failed to persist attachments:", persistErr);
      return NextResponse.json(
        { error: "Failed to persist attachments to GCS" },
        { status: 500 },
      );
    }
  }

  try {
    const info = await transport.sendMail({
      from: account.displayName
        ? `"${account.displayName}" <${account.emailAddress}>`
        : account.emailAddress,
      to: to.join(", "),
      cc: cc?.join(", ") || undefined,
      subject,
      html: htmlForSend || undefined,
      text: bodyText || undefined,
      inReplyTo: inReplyTo || undefined,
      attachments: smtpAttachments.length > 0 ? smtpAttachments : undefined,
    });

    const email = await prisma.emailMessage.create({
      data: {
        id: emailId,
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

    // Auto-save recipient email to influencer profile if they don't have one
    if (influencerId && to[0]) {
      try {
        const influencer = await prisma.influencer.findUnique({
          where: { id: influencerId },
          select: { email: true },
        });
        if (influencer && !influencer.email) {
          await prisma.influencer.update({
            where: { id: influencerId },
            data: { email: to[0] },
          });
          await prisma.activityLog.create({
            data: {
              influencerId,
              type: "email_extracted",
              title: "Email added from compose",
              detail: `Email: ${to[0]}`,
            },
          });
        }
      } catch {
        // Non-critical, don't fail the send
      }
    }

    transport.close();
    return NextResponse.json({ id: email.id, messageId: info.messageId });
  } catch (err: unknown) {
    transport.close();
    if (attachmentsPersisted) {
      await deleteEmailAttachments(account.id, emailId);
    }
    const message = err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseDataImageUri(
  dataUri: string,
): { mime: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1] ?? "image/png";
  const base64 = match[2] ?? "";
  try {
    return { mime, buffer: Buffer.from(base64, "base64") };
  } catch {
    return null;
  }
}

function extensionForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "img";
}
