import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import { assertCanAccess } from "@/app/lib/ownership";
import { uploadToGcs } from "@/app/lib/gcs-upload";

const MAX_FILES_PER_REQUEST = 8;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20 MB
const MAX_TOTAL_BYTES = 60 * 1024 * 1024; // 60 MB

type NoteAttachment = {
  id: string;
  gcsPath: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  uploadedById: string | null;
};

type Params = { params: Promise<{ id: string }> };

// POST /api/influencers/[id]/note-attachments
//   FormData: files[] (image/* only)
//   Appends to influencer.noteAttachments. Returns the updated array.
export async function POST(request: NextRequest, { params }: Params) {
  const user = await requirePermission("influencers", "write");
  const { id } = await params;

  const influencer = await prisma.influencer.findUnique({
    where: { id },
    select: { id: true, createdById: true, noteAttachments: true },
  });
  if (!influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  try {
    await assertCanAccess({
      resourceType: "Influencer",
      resourceId: id,
      user,
      ownerId: influencer.createdById,
      required: "write",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES_PER_REQUEST} per upload)` },
      { status: 400 },
    );
  }

  let total = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) {
      return NextResponse.json(
        { error: `${f.name} is not an image` },
        { status: 400 },
      );
    }
    if (f.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `${f.name} exceeds 20 MB` },
        { status: 400 },
      );
    }
    total += f.size;
  }
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Total upload size exceeds 60 MB" },
      { status: 400 },
    );
  }

  const existing = Array.isArray(influencer.noteAttachments)
    ? (influencer.noteAttachments as unknown as NoteAttachment[])
    : [];

  const fresh: NoteAttachment[] = [];
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer());
    const safeName = f.name.replace(/[^\w.-]+/g, "_");
    const objectPath = `influencers/${id}/notes/${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}`;
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
    fresh.push({
      id: randomBytes(8).toString("hex"),
      gcsPath,
      name: f.name,
      size: f.size,
      type: f.type,
      uploadedAt: new Date().toISOString(),
      uploadedById: user.id,
    });
  }

  const next = [...existing, ...fresh];
  await prisma.influencer.update({
    where: { id },
    data: { noteAttachments: next as unknown as object },
  });

  await prisma.activityLog.create({
    data: {
      influencerId: id,
      type: "note_attachment_added",
      title:
        fresh.length === 1
          ? "Note image added"
          : `${fresh.length} note images added`,
      detail: fresh.map((a) => a.name).join(", "),
      createdById: user.id,
    },
  });

  return NextResponse.json({ attachments: next });
}

// DELETE /api/influencers/[id]/note-attachments?attachmentId=X
//   Removes one attachment from the array (file in GCS is left orphaned —
//   storage is cheap and we don't want to block the response on a delete).
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await requirePermission("influencers", "write");
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json(
      { error: "attachmentId is required" },
      { status: 400 },
    );
  }

  const influencer = await prisma.influencer.findUnique({
    where: { id },
    select: { id: true, createdById: true, noteAttachments: true },
  });
  if (!influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  try {
    await assertCanAccess({
      resourceType: "Influencer",
      resourceId: id,
      user,
      ownerId: influencer.createdById,
      required: "write",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const existing = Array.isArray(influencer.noteAttachments)
    ? (influencer.noteAttachments as unknown as NoteAttachment[])
    : [];
  const removed = existing.find((a) => a.id === attachmentId);
  const next = existing.filter((a) => a.id !== attachmentId);

  if (!removed) {
    return NextResponse.json(
      { error: "Attachment not found" },
      { status: 404 },
    );
  }

  await prisma.influencer.update({
    where: { id },
    data: { noteAttachments: next as unknown as object },
  });

  await prisma.activityLog.create({
    data: {
      influencerId: id,
      type: "note_attachment_removed",
      title: "Note image removed",
      detail: removed.name,
      createdById: user.id,
    },
  });

  return NextResponse.json({ attachments: next });
}
