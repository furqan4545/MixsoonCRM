import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/monitoring/health — round-trip a SELECT 1 to confirm DB + VM.
// Authenticated by middleware; no extra permission needed.
export async function GET() {
  const checkedAt = new Date().toISOString();
  const t0 = performance.now();

  let db:
    | { ok: true; latencyMs: number }
    | { ok: false; error: string; latencyMs: number };
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = { ok: true, latencyMs: Math.round(performance.now() - t0) };
  } catch (e) {
    db = {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      latencyMs: Math.round(performance.now() - t0),
    };
  }

  const dbHost = parseDbHost(process.env.DATABASE_URL);

  return NextResponse.json({
    ok: db.ok,
    db: { ...db, host: dbHost },
    checkedAt,
  });
}

function parseDbHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return null;
  }
}
