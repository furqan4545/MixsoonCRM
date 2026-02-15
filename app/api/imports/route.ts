import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

// POST /api/imports — Upload CSV, parse usernames, create import record
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const usernameLimit = Number(formData.get("usernameLimit") ?? -1);
    const videoCount = Number(formData.get("videoCount") ?? 20);

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only CSV files are accepted" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 },
      );
    }

    // Parse header to find Username column
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const usernameIndex = headers.findIndex(
      (h) => h.toLowerCase() === "username",
    );

    if (usernameIndex === -1) {
      return NextResponse.json(
        { error: 'CSV must contain a "Username" column' },
        { status: 400 },
      );
    }

    // Extract and dedupe usernames
    const rawUsernames = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return cols[usernameIndex] ?? "";
      })
      .filter(Boolean);

    const uniqueUsernames = [...new Set(rawUsernames)];
    const finalUsernames =
      usernameLimit > 0
        ? uniqueUsernames.slice(0, usernameLimit)
        : uniqueUsernames;

    // Create import record
    const importRecord = await prisma.import.create({
      data: {
        sourceFilename: file.name,
        rowCount: rawUsernames.length,
        processedCount: 0,
        status: "PENDING",
        usernameLimit,
        videoCount,
      },
    });

    return NextResponse.json({
      id: importRecord.id,
      sourceFilename: importRecord.sourceFilename,
      rowCount: importRecord.rowCount,
      uniqueCount: uniqueUsernames.length,
      finalCount: finalUsernames.length,
      usernames: finalUsernames,
      status: importRecord.status,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to process CSV" },
      { status: 500 },
    );
  }
}

// GET /api/imports — List all imports
export async function GET() {
  try {
    const imports = await prisma.import.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { influencers: true } },
      },
    });
    return NextResponse.json(imports);
  } catch (error) {
    console.error("Fetch imports error:", error);
    return NextResponse.json(
      { error: "Failed to fetch imports" },
      { status: 500 },
    );
  }
}
