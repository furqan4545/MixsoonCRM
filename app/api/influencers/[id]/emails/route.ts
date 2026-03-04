import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "20"))
  );

  const where = { influencerId: id };

  const [emails, total] = await Promise.all([
    prisma.emailMessage.findMany({
      where,
      orderBy: [{ sentAt: "desc" }, { receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        from: true,
        to: true,
        subject: true,
        bodyText: true,
        bodyHtml: true,
        folder: true,
        isRead: true,
        sentAt: true,
        receivedAt: true,
        createdAt: true,
        threadId: true,
      },
    }),
    prisma.emailMessage.count({ where }),
  ]);

  const items = emails.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    subject: e.subject,
    preview: e.bodyText?.slice(0, 150) ?? "",
    bodyHtml: e.bodyHtml,
    bodyText: e.bodyText,
    folder: e.folder,
    isRead: e.isRead,
    date: e.sentAt ?? e.receivedAt ?? e.createdAt,
    threadId: e.threadId,
    isSent: e.folder === "SENT",
  }));

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
