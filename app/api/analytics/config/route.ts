import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  let config = await prisma.analysisConfig.findUnique({ where: { id: "default" } });

  if (!config) {
    config = await prisma.analysisConfig.create({
      data: { id: "default" },
    });
  }

  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const allowedFields = [
    "videosToSample",
    "commentsPerVideo",
    "maxTotalComments",
    "avatarsToAnalyze",
    "commentBatchSize",
    "defaultMode",
    "geminiModel",
  ] as const;

  const update: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      update[field] = body[field];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const config = await prisma.analysisConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...update },
    update,
  });

  return NextResponse.json(config);
}
