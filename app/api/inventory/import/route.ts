import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requirePermission } from "@/app/lib/rbac";
import * as XLSX from "xlsx";

// POST /api/inventory/import — CSV/Excel product import
export async function POST(request: NextRequest) {
  await requirePermission("inventory", "write");

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  let rows: Record<string, string>[] = [];

  try {
    if (fileName.endsWith(".csv")) {
      const text = await file.text();
      rows = parseCSV(text);
    } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
        defval: "",
      });
    } else {
      return NextResponse.json(
        { error: "Unsupported file format. Use .csv, .xlsx, or .xls" },
        { status: 400 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse file: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  // Normalize column names (case-insensitive matching)
  const normalized = rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      out[key.toLowerCase().trim()] = String(val).trim();
    }
    return out;
  });

  // Map columns
  const findCol = (row: Record<string, string>, candidates: string[]) =>
    candidates.find((c) => row[c] !== undefined) || "";

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const row = normalized[i];
    const nameCol = findCol(row, ["name", "product name", "product_name", "productname", "title"]);
    const skuCol = findCol(row, ["sku", "product code", "product_code", "code", "item code"]);
    const qtyCol = findCol(row, ["quantity", "qty", "stock", "count"]);
    const catCol = findCol(row, ["category", "type", "product type"]);
    const costCol = findCol(row, ["unit cost", "unit_cost", "unitcost", "cost", "price"]);
    const descCol = findCol(row, ["description", "desc", "details"]);

    const name = nameCol ? row[nameCol] : "";
    const sku = skuCol ? row[skuCol] : "";

    if (!name || !sku) {
      errors.push(`Row ${i + 2}: Missing name or SKU`);
      skipped++;
      continue;
    }

    const quantity = qtyCol ? parseInt(row[qtyCol]) || 0 : 0;
    const category = catCol ? row[catCol] || null : null;
    const unitCost = costCol ? parseFloat(row[costCol]) || null : null;
    const description = descCol ? row[descCol] || null : null;

    try {
      const existing = await prisma.product.findUnique({ where: { sku } });
      if (existing) {
        // Update quantity (add to existing)
        await prisma.product.update({
          where: { sku },
          data: {
            name,
            quantity: existing.quantity + quantity,
            ...(category ? { category } : {}),
            ...(unitCost ? { unitCost } : {}),
            ...(description ? { description } : {}),
          },
        });
        updated++;
      } else {
        await prisma.product.create({
          data: { name, sku, quantity, category, unitCost, description },
        });
        created++;
      }
    } catch (err) {
      errors.push(
        `Row ${i + 2} (${sku}): ${err instanceof Error ? err.message : String(err)}`,
      );
      skipped++;
    }
  }

  return NextResponse.json({
    total: normalized.length,
    created,
    updated,
    skipped,
    errors: errors.slice(0, 20), // limit error messages
  });
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.replace(/^"|"$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || "";
    });
    rows.push(row);
  }
  return rows;
}
