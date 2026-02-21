import { NextResponse } from "next/server";

const ADMIN_EMAIL = "admin@mixsoon.com";
const ADMIN_PASSWORD = "admin123";

function json500(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const details = err instanceof Error ? err.stack : String(err);
  return NextResponse.json({ error: message, details }, { status: 500 });
}

/**
 * Dev-only: force-set admin password so login works.
 * Open: http://localhost:3000/api/dev/fix-admin-password
 * Then log in with admin@mixsoon.com / admin123
 */
export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not available in production" }, { status: 404 });
    }

    const bcrypt = await import("bcryptjs");
    const { prisma } = await import("@/app/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });
    if (!user) {
      return NextResponse.json(
        { error: "Admin user not found. Run: npm run db:seed" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await prisma.user.updateMany({
      where: { email: ADMIN_EMAIL },
      data: { passwordHash, status: "ACTIVE" },
    });

    return NextResponse.json({
      ok: true,
      message: `Password set for ${ADMIN_EMAIL}. Log in with password: ${ADMIN_PASSWORD}`,
    });
  } catch (err) {
    console.error("[fix-admin-password]", err);
    return json500(err);
  }
}

export async function POST() {
  return GET();
}
