import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET() {
  let config = await prisma.scrapingConfig.findUnique({
    where: { id: "default" },
  });
  if (!config) {
    config = await prisma.scrapingConfig.create({
      data: { id: "default" },
    });
  }
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const raw = Number(body?.concurrency);
  if (!Number.isFinite(raw)) {
    return NextResponse.json(
      { error: "concurrency must be a number" },
      { status: 400 },
    );
  }
  // Clamp: 1 is minimum useful, 50 is a sane ceiling (Apify plans rarely exceed this).
  const concurrency = Math.max(1, Math.min(50, Math.floor(raw)));

  const config = await prisma.scrapingConfig.upsert({
    where: { id: "default" },
    create: { id: "default", concurrency },
    update: { concurrency },
  });

  return NextResponse.json(config);
}
