import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/app/lib/rbac";
import { prisma } from "../../lib/prisma";

// POST /api/imports — Upload CSV, parse usernames, create import record
export async function POST(request: NextRequest) {
  let currentUser;
  try {
    currentUser = await requirePermission("imports", "write");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const usernameLimit = Number(formData.get("usernameLimit") ?? -1);
    const videoCount = Number(formData.get("videoCount") ?? 20);

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const isCsv = file.name.endsWith(".csv");
    const isExcel = file.name.match(/\.(xlsx|xls)$/i);

    if (!isCsv && !isExcel) {
      return NextResponse.json(
        { error: "Only CSV and Excel files are accepted" },
        { status: 400 },
      );
    }

    let rawUsernames: string[] = [];

    if (isCsv) {
      const text = await file.text();
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }

      // Parse header to find Username column
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));
      let usernameIndex = headers.findIndex(
        (h) => h.toLowerCase() === "username",
      );

      let dataLines = lines.slice(1);

      // If no "Username" header is found, assume the first column is the username column
      // and that the first row might be data if it doesn't look like a header row
      if (usernameIndex === -1) {
        usernameIndex = 0;
        // If the first row doesn't contain "username" (we know it doesn't), we treat it as data
        dataLines = lines;
      }

      // Extract and dedupe usernames
      rawUsernames = dataLines
        .map((line) => {
          const cols = line
            .split(",")
            .map((c) => c.trim().replace(/^"|"$/g, ""));
          return cols[usernameIndex] ?? "";
        })
        .filter(Boolean);
    } else if (isExcel) {
      const arrayBuffer = await file.arrayBuffer();
      const xlsx = await import("xlsx");
      const workbook = xlsx.read(arrayBuffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Convert to array of arrays
      const data = xlsx.utils.sheet_to_json<string[]>(worksheet, {
        header: 1,
        defval: "",
      });

      if (data.length === 0) {
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }

      const headers = (data[0] || []).map((h) => String(h).trim());
      let usernameIndex = headers.findIndex(
        (h) => h.toLowerCase() === "username",
      );

      let dataRows = data.slice(1);

      if (usernameIndex === -1) {
        usernameIndex = 0;
        dataRows = data;
      }

      rawUsernames = dataRows
        .map((row) => {
          return String(row[usernameIndex] || "").trim();
        })
        .filter(Boolean);
    }

    const uniqueUsernames = [...new Set(rawUsernames)];
    const finalUsernames =
      usernameLimit > 0
        ? uniqueUsernames.slice(0, usernameLimit)
        : uniqueUsernames;

    // Look up existing influencers + their video counts for incremental scraping
    const keys = finalUsernames.map((u) => u.toLowerCase().trim());
    const existing = await prisma.influencer.findMany({
      where: { username: { in: keys } },
      select: { username: true, _count: { select: { videos: true } } },
    });
    const existingMap = new Map(
      existing.map((e) => [e.username, e._count.videos]),
    );

    const toScrape: string[] = [];
    const toRescrape: string[] = [];
    const skipped: string[] = [];

    for (const u of finalUsernames) {
      const key = u.toLowerCase().trim();
      const existingCount = existingMap.get(key);
      if (existingCount == null) {
        toScrape.push(u);
      } else if (existingCount < videoCount) {
        toRescrape.push(u);
      } else {
        skipped.push(u);
      }
    }

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

    // Auto-assign uploading user as PIC to existing influencers in this CSV
    if (currentUser?.id) {
      const existingUsernames = [...toRescrape, ...skipped].map((u) => u.toLowerCase().trim());
      if (existingUsernames.length > 0) {
        const existingInfluencers = await prisma.influencer.findMany({
          where: { username: { in: existingUsernames } },
          select: { id: true },
        });
        if (existingInfluencers.length > 0) {
          await prisma.influencerPic.createMany({
            data: existingInfluencers.map((inf) => ({
              influencerId: inf.id,
              userId: currentUser.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    return NextResponse.json({
      id: importRecord.id,
      sourceFilename: importRecord.sourceFilename,
      rowCount: importRecord.rowCount,
      uniqueCount: uniqueUsernames.length,
      finalCount: finalUsernames.length,
      usernames: finalUsernames,
      toScrape,
      toRescrape,
      skipped,
      videoCount,
      status: importRecord.status,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 },
    );
  }
}

// GET /api/imports — List all imports
export async function GET() {
  let currentUser;
  try {
    currentUser = await requirePermission("imports", "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const isAdmin = currentUser.role === "Admin";
    const where = !isAdmin && currentUser.id
      ? { influencers: { some: { pics: { some: { userId: currentUser.id } } } } }
      : undefined;

    const imports = await prisma.import.findMany({
      where,
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
