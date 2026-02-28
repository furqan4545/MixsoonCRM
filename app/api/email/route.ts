import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url);
  const folder = (url.searchParams.get("folder") ?? "INBOX").toUpperCase();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("pageSize") ?? "30")),
  );
  const search = url.searchParams.get("q") ?? "";

  const where: Record<string, unknown> = {
    accountId: account.id,
    folder,
  };

  const orderBy =
    folder === "SENT"
      ? [{ sentAt: "desc" as const }, { createdAt: "desc" as const }]
      : folder === "DRAFTS"
        ? [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }]
        : [{ receivedAt: "desc" as const }, { createdAt: "desc" as const }];

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { from: { contains: search, mode: "insensitive" } },
      { bodyText: { contains: search, mode: "insensitive" } },
    ];
  }

  const [emails, total] = await Promise.all([
    prisma.emailMessage.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        from: true,
        to: true,
        subject: true,
        bodyText: true,
        folder: true,
        isRead: true,
        isStarred: true,
        sentAt: true,
        receivedAt: true,
        createdAt: true,
        influencerId: true,
      },
    }),
    prisma.emailMessage.count({ where }),
  ]);

  const items = emails.map((e) => ({
    ...e,
    preview: e.bodyText?.slice(0, 120) ?? "",
    bodyText: undefined,
  }));

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
