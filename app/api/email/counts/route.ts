import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getCurrentUser } from "@/app/lib/rbac";

export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.emailAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account) return NextResponse.json({});

  const rows = await prisma.emailMessage.groupBy({
    by: ["folder"],
    where: { accountId: account.id, isRead: false },
    _count: { id: true },
  });

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.folder] = row._count.id;
  }

  return NextResponse.json(counts);
}
