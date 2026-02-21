import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/prisma";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body as {
      email?: string;
      password?: string;
      name?: string;
    };

    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: trimmedEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 },
      );
    }

    const viewerRole = await prisma.role.findUnique({
      where: { name: "Viewer" },
    });
    if (!viewerRole) {
      return NextResponse.json(
        {
          error:
            "Server setup incomplete: run 'npm run db:seed' to create roles (Admin, PIC, Viewer).",
        },
        { status: 500 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        email: trimmedEmail,
        name: typeof name === "string" && name.trim() ? name.trim() : null,
        passwordHash,
        status: "PENDING",
        roleId: viewerRole.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    const details = error instanceof Error ? String(error) : null;
    console.error("[register]", error);
    return NextResponse.json(
      {
        error: "Registration failed",
        ...(process.env.NODE_ENV === "development" && details && { details }),
      },
      { status: 500 },
    );
  }
}
