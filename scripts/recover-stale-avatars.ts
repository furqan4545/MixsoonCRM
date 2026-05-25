/**
 * Recover stale avatars: re-scrape influencers whose avatarUrl still points to
 * the raw TikTok CDN (signed URLs expire after a few hours, leaving 403s and
 * fallback initials in the UI), then immediately cache the fresh URL to GCS.
 *
 * Cause: app/lib/gcs-save.ts used to silently skip avatars when the source URL
 * 403'd at cache time, leaving the row with a raw tiktokcdn URL that would
 * later expire. That's now surfaced (import is marked DRAFT with a partial-
 * failure message), but existing rows still need this one-shot backfill.
 *
 * Usage:
 *   npx tsx scripts/recover-stale-avatars.ts             # dry run, prints what would be done
 *   npx tsx scripts/recover-stale-avatars.ts --apply     # actually re-scrape and cache
 *   npx tsx scripts/recover-stale-avatars.ts --apply --batch=40 --limit=100
 *
 * Env required: APIFY_API_KEY, DATABASE_URL, GCS_BUCKET_NAME (via .env).
 */

import { cacheRemoteImageToGcs } from "../app/lib/gcs-media";
import { prisma } from "../app/lib/prisma";

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const APIFY_PROFILE_ACTOR_ID = "BW7peEX6cuzdpgpam"; // xtdata profile scraper — same as app/api/scrape
const MAX_APIFY_RUN_WAIT_MS = 10 * 60 * 1000;

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const importIdArg = args.find((a) => a.startsWith("--import="));
  return {
    apply,
    batchSize: batchArg ? Number(batchArg.split("=")[1]) || 40 : 40,
    limit: limitArg
      ? Number(limitArg.split("=")[1]) || Number.POSITIVE_INFINITY
      : Number.POSITIVE_INFINITY,
    importId: importIdArg ? importIdArg.split("=")[1] : undefined,
  };
}

interface ProfileResult {
  unique_id?: string;
  nickname?: string;
  avatar_larger?: { url_list?: string[] };
  avatar_medium?: { url_list?: string[] };
  avatar_thumb?: { url_list?: string[] };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeProfiles(
  usernames: string[],
): Promise<Map<string, ProfileResult>> {
  if (!APIFY_API_KEY) throw new Error("APIFY_API_KEY missing — check .env");

  console.log(
    `  → Starting Apify profile scrape for ${usernames.length} usernames...`,
  );
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_PROFILE_ACTOR_ID}/runs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${APIFY_API_KEY}`,
      },
      body: JSON.stringify({ usernames, maxItems: usernames.length }),
    },
  );
  if (!startRes.ok) {
    const errText = await startRes.text().catch(() => startRes.statusText);
    throw new Error(`Apify start failed: ${startRes.status} ${errText}`);
  }
  const startData = (await startRes.json()) as { data: { id: string } };
  const runId = startData.data.id;
  console.log(`  → Apify run ${runId} — polling...`);

  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt > MAX_APIFY_RUN_WAIT_MS) {
      throw new Error(`Apify timed out after ${MAX_APIFY_RUN_WAIT_MS}ms`);
    }
    await sleep(5000);
    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}`,
      { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
    );
    if (!statusRes.ok) continue;
    const statusJson = (await statusRes.json()) as { data: { status: string } };
    const s = statusJson.data.status;
    if (s === "SUCCEEDED") break;
    if (s === "FAILED" || s === "ABORTED" || s === "TIMED-OUT") {
      throw new Error(`Apify run ${s}`);
    }
    process.stdout.write(".");
  }
  console.log("");

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?format=json`,
    { headers: { Authorization: `Bearer ${APIFY_API_KEY}` } },
  );
  if (!datasetRes.ok) throw new Error(`Apify dataset fetch failed`);
  const items = (await datasetRes.json()) as ProfileResult[];

  const map = new Map<string, ProfileResult>();
  for (const item of items) {
    const u = (item.unique_id ?? item.nickname ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/^@/, "");
    if (u) map.set(u, item);
  }
  console.log(
    `  → Got fresh data for ${map.size}/${usernames.length} usernames`,
  );
  return map;
}

function freshAvatarUrl(p: ProfileResult): string | null {
  return (
    p.avatar_larger?.url_list?.[0] ??
    p.avatar_medium?.url_list?.[0] ??
    p.avatar_thumb?.url_list?.[0] ??
    null
  );
}

async function main() {
  const { apply, batchSize, limit, importId } = parseArgs();

  const where: Parameters<typeof prisma.influencer.findMany>[0] extends {
    where?: infer W;
  }
    ? W
    : never = {
    avatarUrl: { contains: "tiktokcdn", not: undefined },
    ...(importId ? { importId } : {}),
  } as never;

  const stale = await prisma.influencer.findMany({
    where: where as never,
    select: { id: true, username: true, avatarUrl: true, importId: true },
    orderBy: { username: "asc" },
  });

  const filtered = stale.filter((s) => s.avatarUrl?.includes("tiktokcdn"));
  const targets = filtered.slice(0, limit);

  console.log(
    `Found ${filtered.length} influencer(s) with raw tiktokcdn avatar URLs` +
      (importId ? ` (filtered to import ${importId})` : "") +
      (limit !== Number.POSITIVE_INFINITY
        ? `, processing first ${targets.length}`
        : ""),
  );
  if (targets.length === 0) return;

  if (!apply) {
    console.log("\nDry run — pass --apply to actually re-scrape & cache.");
    console.log("Sample of affected usernames:");
    for (const t of targets.slice(0, 10)) console.log(`  @${t.username}`);
    if (targets.length > 10)
      console.log(`  ... and ${targets.length - 10} more`);
    return;
  }

  // Group by importId so each cached file lands under the right import path
  const byImport = new Map<string, typeof targets>();
  for (const t of targets) {
    const k = t.importId ?? "__no_import__";
    const arr = byImport.get(k) ?? [];
    arr.push(t);
    byImport.set(k, arr);
  }

  let totalOk = 0;
  let totalSkippedNoFresh = 0;
  let totalCacheFailed = 0;

  for (const [impId, group] of byImport.entries()) {
    console.log(`\n── Import ${impId} (${group.length} influencers) ──`);

    // Batch the Apify call to stay within reasonable run sizes
    for (let i = 0; i < group.length; i += batchSize) {
      const batch = group.slice(i, i + batchSize);
      const usernames = batch.map((b) => b.username);
      console.log(
        `\nBatch ${Math.floor(i / batchSize) + 1}/${Math.ceil(group.length / batchSize)} (${batch.length} usernames)`,
      );

      let scraped: Map<string, ProfileResult>;
      try {
        scraped = await scrapeProfiles(usernames);
      } catch (err) {
        console.error(
          `  ✗ Apify failed for this batch (${(err as Error).message}) — skipping`,
        );
        totalSkippedNoFresh += batch.length;
        continue;
      }

      // Cache each one
      for (const inf of batch) {
        const fresh = scraped.get(inf.username.toLowerCase());
        const freshUrl = fresh ? freshAvatarUrl(fresh) : null;
        if (!freshUrl) {
          console.warn(`  ⚠ @${inf.username}: no fresh avatar URL from Apify`);
          totalSkippedNoFresh += 1;
          continue;
        }

        try {
          const gcs = await cacheRemoteImageToGcs({
            sourceUrl: freshUrl,
            importId: impId === "__no_import__" ? "_orphan" : impId,
            kind: "avatars",
            username: inf.username,
            runKey: `recovery-${new Date().toISOString().slice(0, 10)}`,
          });
          if (!gcs) {
            console.warn(
              `  ✗ @${inf.username}: fresh URL also failed to cache`,
            );
            totalCacheFailed += 1;
            continue;
          }
          await prisma.influencer.update({
            where: { id: inf.id },
            data: { avatarUrl: gcs },
          });
          totalOk += 1;
          console.log(`  ✓ @${inf.username} → ${gcs.slice(0, 80)}...`);
        } catch (err) {
          console.error(`  ✗ @${inf.username}: ${(err as Error).message}`);
          totalCacheFailed += 1;
        }
      }
    }
  }

  console.log(
    `\n━━━ Done ━━━\n` +
      `  ✓ Recovered: ${totalOk}\n` +
      `  ⚠ No fresh avatar (account deleted/private): ${totalSkippedNoFresh}\n` +
      `  ✗ Cache failed: ${totalCacheFailed}`,
  );
}

main()
  .catch((err) => {
    console.error("\nFatal:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
