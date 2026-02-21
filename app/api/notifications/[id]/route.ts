import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const read = body.read === true;

  const notification = await prisma.notification.update({
    where: { id },
    data: { read },
  });
  return NextResponse.json(notification);
}
