import { prisma } from "./prisma";

// ─── Types ──────────────────────────────────────────────────

export interface UsageLogInput {
  service: "apify_video" | "apify_profile" | "apify_comments" | "gemini_nlp" | "gemini_vision";
  action: string;
  importId?: string | null;
  influencerId?: string | null;
  analysisRunId?: string | null;
  apifyRunId?: string | null;
  apifyActorId?: string | null;
  costUsd?: number;
  inputCount?: number;
  outputCount?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  status?: "success" | "failed" | "partial";
  errorMessage?: string | null;
}

export interface ApifyBalance {
  monthlyUsageUsd: number;
  maxMonthlyUsageUsd: number;
  remainingUsd: number;
  usagePercent: number;
  cycleStart: string;
  cycleEnd: string;
  computeUnitsUsed: number;
  maxComputeUnits: number;
}

export interface ApifyDailyUsage {
  date: string;
  totalUsageCreditsUsd: number;
  serviceUsage: Record<string, { quantity: number; baseAmountUsd: number }>;
}

export interface ApifyMonthlyUsage {
  startAt: string;
  endAt: string;
  totalUsageCreditsUsd: number;
  dailyUsages: ApifyDailyUsage[];
  serviceBreakdown: Record<string, number>;
}

// ─── Gemini cost estimation ─────────────────────────────────

// Gemini 2.0 Flash pricing
const GEMINI_INPUT_PRICE_PER_TOKEN = 0.10 / 1_000_000;   // $0.10 per 1M input tokens
const GEMINI_OUTPUT_PRICE_PER_TOKEN = 0.40 / 1_000_000;   // $0.40 per 1M output tokens
const GEMINI_IMAGE_TOKENS = 258;  // ~258 tokens per image for Gemini Vision

export function estimateGeminiCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * GEMINI_INPUT_PRICE_PER_TOKEN + outputTokens * GEMINI_OUTPUT_PRICE_PER_TOKEN;
}

export function estimateTokensFromText(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for CJK
  return Math.ceil(text.length / 3.5);
}

// ─── Log API usage ──────────────────────────────────────────

export async function logApiUsage(data: UsageLogInput): Promise<void> {
  try {
    await prisma.apiUsageLog.create({
      data: {
        service: data.service,
        action: data.action,
        importId: data.importId ?? null,
        influencerId: data.influencerId ?? null,
        analysisRunId: data.analysisRunId ?? null,
        apifyRunId: data.apifyRunId ?? null,
        apifyActorId: data.apifyActorId ?? null,
        costUsd: data.costUsd ?? 0,
        inputCount: data.inputCount ?? 0,
        outputCount: data.outputCount ?? 0,
        durationMs: data.durationMs ?? 0,
        inputTokens: data.inputTokens ?? 0,
        outputTokens: data.outputTokens ?? 0,
        status: data.status ?? "success",
        errorMessage: data.errorMessage ?? null,
      },
    });
  } catch (err) {
    console.error("[UsageTracking] Failed to log usage:", err);
  }
}

// ─── Apify Balance ──────────────────────────────────────────

export async function getApifyBalance(): Promise<ApifyBalance> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY is missing");

  const res = await fetch(
    `https://api.apify.com/v2/users/me/limits?token=${apiKey}`,
    { next: { revalidate: 60 } }, // Cache for 60s
  );

  if (!res.ok) {
    throw new Error(`Apify limits API failed: ${res.status}`);
  }

  const { data } = await res.json();

  const monthlyUsageUsd = data.current?.monthlyUsageUsd ?? data.monthlyUsageUsd ?? 0;
  const maxMonthlyUsageUsd = data.limits?.maxMonthlyUsageUsd ?? data.maxMonthlyUsageUsd ?? 0;
  const remainingUsd = Math.max(0, maxMonthlyUsageUsd - monthlyUsageUsd);
  const usagePercent = maxMonthlyUsageUsd > 0 ? (monthlyUsageUsd / maxMonthlyUsageUsd) * 100 : 0;

  return {
    monthlyUsageUsd: Math.round(monthlyUsageUsd * 100) / 100,
    maxMonthlyUsageUsd: Math.round(maxMonthlyUsageUsd * 100) / 100,
    remainingUsd: Math.round(remainingUsd * 100) / 100,
    usagePercent: Math.round(usagePercent * 10) / 10,
    cycleStart: data.current?.usageCycle?.startAt ?? data.monthlyUsageCycle?.startAt ?? "",
    cycleEnd: data.current?.usageCycle?.endAt ?? data.monthlyUsageCycle?.endAt ?? "",
    computeUnitsUsed: data.current?.monthlyActorComputeUnits ?? data.monthlyActorComputeUnits ?? 0,
    maxComputeUnits: data.limits?.maxMonthlyActorComputeUnits ?? data.maxMonthlyActorComputeUnits ?? 0,
  };
}

// ─── Apify Monthly Usage ────────────────────────────────────

export async function getApifyMonthlyUsage(date?: string): Promise<ApifyMonthlyUsage> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY is missing");

  const dateParam = date ? `&date=${date}` : "";
  const res = await fetch(
    `https://api.apify.com/v2/users/me/usage/monthly?token=${apiKey}${dateParam}`,
    { next: { revalidate: 300 } }, // Cache for 5 min
  );

  if (!res.ok) {
    throw new Error(`Apify usage API failed: ${res.status}`);
  }

  const { data } = await res.json();

  // Parse daily breakdown
  const dailyUsages: ApifyDailyUsage[] = (data.dailyServiceUsages ?? []).map(
    (day: { date: string; totalUsageCreditsUsd: number; serviceUsage: Record<string, unknown> }) => ({
      date: day.date,
      totalUsageCreditsUsd: day.totalUsageCreditsUsd ?? 0,
      serviceUsage: day.serviceUsage ?? {},
    }),
  );

  // Aggregate service breakdown
  const serviceBreakdown: Record<string, number> = {};
  const monthlyServices = data.monthlyServiceUsage ?? {};
  for (const [key, val] of Object.entries(monthlyServices)) {
    const svc = val as { baseAmountUsd?: number; amountAfterVolumeDiscountUsd?: number };
    serviceBreakdown[key] = svc.amountAfterVolumeDiscountUsd ?? svc.baseAmountUsd ?? 0;
  }

  return {
    startAt: data.startAt ?? "",
    endAt: data.endAt ?? "",
    totalUsageCreditsUsd: data.totalUsageCreditsUsdAfterVolumeDiscount ?? data.totalUsageCreditsUsdBeforeVolumeDiscount ?? 0,
    dailyUsages,
    serviceBreakdown,
  };
}

// ─── Local Stats Aggregation ────────────────────────────────

export interface UsageStats {
  totalCostUsd: number;
  totalCalls: number;
  avgCostPerInfluencer: number;
  costByService: Record<string, number>;
  callsByService: Record<string, number>;
  costByDay: { date: string; cost: number }[];
  costByImport: { importId: string; filename: string; cost: number; callCount: number }[];
}

export async function getUsageStats(filters?: {
  from?: Date;
  to?: Date;
  importId?: string;
}): Promise<UsageStats> {
  const where: Record<string, unknown> = {};
  if (filters?.from || filters?.to) {
    where.createdAt = {};
    if (filters.from) (where.createdAt as Record<string, unknown>).gte = filters.from;
    if (filters.to) (where.createdAt as Record<string, unknown>).lte = filters.to;
  }
  if (filters?.importId) {
    where.importId = filters.importId;
  }

  const logs = await prisma.apiUsageLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
  });

  // Aggregate
  let totalCostUsd = 0;
  const costByService: Record<string, number> = {};
  const callsByService: Record<string, number> = {};
  const costByDayMap = new Map<string, number>();
  const costByImportMap = new Map<string, { cost: number; callCount: number }>();
  const influencerIds = new Set<string>();

  for (const log of logs) {
    totalCostUsd += log.costUsd;

    costByService[log.service] = (costByService[log.service] ?? 0) + log.costUsd;
    callsByService[log.service] = (callsByService[log.service] ?? 0) + 1;

    const day = log.createdAt.toISOString().slice(0, 10);
    costByDayMap.set(day, (costByDayMap.get(day) ?? 0) + log.costUsd);

    if (log.importId) {
      const existing = costByImportMap.get(log.importId) ?? { cost: 0, callCount: 0 };
      existing.cost += log.costUsd;
      existing.callCount += 1;
      costByImportMap.set(log.importId, existing);
    }

    if (log.influencerId) influencerIds.add(log.influencerId);
  }

  // Get import filenames
  const importIds = [...costByImportMap.keys()];
  const imports = importIds.length > 0
    ? await prisma.import.findMany({
        where: { id: { in: importIds } },
        select: { id: true, sourceFilename: true },
      })
    : [];
  const importNameMap = new Map(imports.map((i) => [i.id, i.sourceFilename]));

  return {
    totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
    totalCalls: logs.length,
    avgCostPerInfluencer: influencerIds.size > 0
      ? Math.round((totalCostUsd / influencerIds.size) * 10000) / 10000
      : 0,
    costByService,
    callsByService,
    costByDay: [...costByDayMap.entries()].map(([date, cost]) => ({
      date,
      cost: Math.round(cost * 10000) / 10000,
    })),
    costByImport: [...costByImportMap.entries()].map(([importId, data]) => ({
      importId,
      filename: importNameMap.get(importId) ?? importId,
      cost: Math.round(data.cost * 10000) / 10000,
      callCount: data.callCount,
    })),
  };
}
