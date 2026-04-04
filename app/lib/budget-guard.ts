import { prisma } from "./prisma";

// ─── Types ──────────────────────────────────────────────────

export interface BudgetStatus {
  blocked: boolean;
  reason: string | null;       // "budget_exceeded" | "manual" | null
  currentSpendUsd: number;
  monthlyCapUsd: number;
  gcpManualCostUsd: number;
  isBlocked: boolean;
  blockedAt: Date | null;
  blockedByUserId: string | null;
  unblockedAt: Date | null;
  unblockedByUserId: string | null;
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

// ─── Cache ──────────────────────────────────────────────────

let cachedStatus: { status: BudgetStatus; checkedAt: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

export function refreshBudgetCache(): void {
  cachedStatus = null;
}

// ─── Core Functions ─────────────────────────────────────────

/**
 * Get current-month actual spend from ApiUsageLog only.
 * This is real tracked API spend (Apify + Gemini calls).
 * GCP quota is NOT included here — it's a budget limit, not spend.
 */
async function getCurrentMonthSpend(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await prisma.apiUsageLog.aggregate({
    _sum: { costUsd: true },
    where: {
      createdAt: { gte: monthStart },
    },
  });

  return result._sum.costUsd ?? 0;
}

/**
 * Get or create the BudgetConfig singleton.
 */
async function getOrCreateBudgetConfig() {
  let config = await prisma.budgetConfig.findUnique({
    where: { id: "default" },
  });

  if (!config) {
    config = await prisma.budgetConfig.create({
      data: { id: "default" },
    });
  }

  return config;
}

/**
 * Fetch the full budget status (uses cache if fresh).
 */
export async function getBudgetStatus(forceRefresh = false): Promise<BudgetStatus> {
  const now = Date.now();

  if (!forceRefresh && cachedStatus && now - cachedStatus.checkedAt < CACHE_TTL_MS) {
    return cachedStatus.status;
  }

  const config = await getOrCreateBudgetConfig();
  const apiSpend = await getCurrentMonthSpend();
  // Total spend = only actual tracked API costs (Apify + Gemini)
  // GCP quota is a separate budget limit, NOT added to spend
  const totalSpend = apiSpend;

  // Auto-block if cap is set and exceeded
  if (
    config.monthlyCapUsd > 0 &&
    totalSpend >= config.monthlyCapUsd &&
    !config.isBlocked
  ) {
    await prisma.budgetConfig.update({
      where: { id: "default" },
      data: {
        isBlocked: true,
        blockedAt: new Date(),
        blockReason: "budget_exceeded",
        blockedByUserId: null, // system auto-block
      },
    });
    config.isBlocked = true;
    config.blockReason = "budget_exceeded";
    config.blockedAt = new Date();
  }

  const status: BudgetStatus = {
    blocked: config.isBlocked,
    reason: config.blockReason,
    currentSpendUsd: Math.round(totalSpend * 10000) / 10000,
    monthlyCapUsd: config.monthlyCapUsd,
    gcpManualCostUsd: config.gcpManualCostUsd,
    isBlocked: config.isBlocked,
    blockedAt: config.blockedAt,
    blockedByUserId: config.blockedByUserId,
    unblockedAt: config.unblockedAt,
    unblockedByUserId: config.unblockedByUserId,
  };

  cachedStatus = { status, checkedAt: Date.now() };
  return status;
}

/**
 * Check budget before making an API call. Throws BudgetExceededError if blocked.
 */
export async function checkBudgetOrThrow(): Promise<void> {
  const status = await getBudgetStatus();

  if (status.blocked) {
    const reason =
      status.reason === "budget_exceeded"
        ? `Monthly budget cap of $${status.monthlyCapUsd} exceeded (current spend: $${status.currentSpendUsd}). Admin approval required to resume.`
        : "API requests have been manually blocked by admin. Admin approval required to resume.";
    throw new BudgetExceededError(reason);
  }
}

/**
 * Non-throwing version: returns boolean.
 */
export async function isBudgetBlocked(): Promise<boolean> {
  const status = await getBudgetStatus();
  return status.blocked;
}
