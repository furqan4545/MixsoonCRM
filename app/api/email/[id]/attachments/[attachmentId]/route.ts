import { type NextRequest, NextResponse } from "next/server";
import { readEmailAttachmentById } from "@/app/lib/email-attachments";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, attachmentId } = await params;

  const email = await prisma.emailMessage.findFirst({
    where: { id, account: { userId: user.id } },
    select: { id: true, accountId: true },
  });
  if (!email) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attachment = await readEmailAttachmentById(
    email.accountId,
    email.id,
    attachmentId,
  );
  if (!attachment) {
    return NextResponse.json(
      { error: "Attachment not found" },
      { status: 404 },
    );
  }

  const disposition =
    attachment.mimeType.startsWith("image/") ||
    attachment.mimeType.startsWith("video/")
      ? "inline"
      : "attachment";
  return new Response(attachment.buffer, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.buffer.byteLength),
      "Content-Disposition": `${disposition}; filename="${encodeFilename(
        attachment.filename,
      )}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

function encodeFilename(filename: string): string {
  return filename.replace(/"/g, "'");
}
