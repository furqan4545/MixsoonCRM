import { prisma } from "./prisma";

/**
 * Platform-wide Apify concurrency, clamped to [1, 50]. Every Apify scrape
 * (video, profile, comment) should use this value via runWithConcurrency.
 */
export async function getScrapingConcurrency(): Promise<number> {
  const cfg = await prisma.scrapingConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const raw = cfg?.concurrency ?? 10;
  return Math.max(1, Math.min(50, Math.floor(raw)));
}
