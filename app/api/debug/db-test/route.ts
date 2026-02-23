import { NextResponse } from "next/server";

export async function GET() {
  const diagnostics: Record<string, unknown> = {
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    AUTH_SECRET_SET: !!process.env.AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
  };

  try {
    const { prisma } = await import("@/app/lib/prisma");
    const count = await prisma.user.count();
    diagnostics.db_connected = true;
    diagnostics.user_count = count;

    const admin = await prisma.user.findUnique({
      where: { email: "admin@mixsoon.com" },
      select: { email: true, status: true, passwordHash: true },
    });
    diagnostics.admin_exists = !!admin;
    diagnostics.admin_status = admin?.status ?? null;
    diagnostics.admin_hash_prefix = admin?.passwordHash?.substring(0, 7) ?? null;
  } catch (err: unknown) {
    diagnostics.db_connected = false;
    diagnostics.db_error = err instanceof Error ? err.message : String(err);
    diagnostics.db_error_name = err instanceof Error ? err.name : "unknown";
  }

  return NextResponse.json(diagnostics);
}
