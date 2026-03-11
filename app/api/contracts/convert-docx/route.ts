import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { requirePermission } from "@/app/lib/rbac";

// POST /api/contracts/convert-docx — Convert uploaded .docx to HTML
export async function POST(request: Request) {
  try {
    await requirePermission("influencers", "write");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".docx")) {
      return NextResponse.json(
        { error: "Only .docx files are supported" },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be under 10 MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.convertToHtml({ buffer });

    return NextResponse.json({
      html: result.value,
      warnings: result.messages.map((m) => m.message),
    });
  } catch (error) {
    console.error("[POST /api/contracts/convert-docx]", error);
    return NextResponse.json(
      { error: "Failed to convert document" },
      { status: 500 },
    );
  }
}
