/**
 * Client-safe permission constants. Do not import rbac, prisma, or auth here.
 * Used by client components (e.g. sidebar) to decide which nav items to show.
 */

export const FEATURES = {
  DATA_SCRAPER: "data-scraper",
  CSV_UPLOAD: "csv-upload",
  IMPORTS: "imports",
  AI_FILTER: "ai-filter",
  QUEUES: "queues",
  INFLUENCERS: "influencers",
  NOTIFICATIONS: "notifications",
  USERS: "users",
  EMAIL: "email",
  CAMPAIGNS: "campaigns",
  APPROVALS: "approvals",
  ALERTS: "alerts",
  INVENTORY: "inventory",
  SHIPPING: "shipping",
  TRACKING: "tracking",
  PAYMENTS: "payments",
  BILLING: "billing",
} as const;

/** Sidebar nav: path → required permission (read). null = no requirement (e.g. Dashboard). */
export const NAV_FEATURE_MAP: Record<
  string,
  { feature: string; action: string } | null
> = {
  "/": null,
  "/data-scraper": { feature: FEATURES.DATA_SCRAPER, action: "read" },
  "/imports": { feature: FEATURES.IMPORTS, action: "read" },
  "/influencers": { feature: FEATURES.INFLUENCERS, action: "read" },
  "/campaigns": { feature: FEATURES.CAMPAIGNS, action: "read" },
  "/campaigns/filters": { feature: FEATURES.AI_FILTER, action: "read" },
  "/ai-filter": { feature: FEATURES.AI_FILTER, action: "read" },
  "/queues": { feature: FEATURES.QUEUES, action: "read" },
  "/notifications": { feature: FEATURES.NOTIFICATIONS, action: "read" },
  "/email": { feature: FEATURES.EMAIL, action: "read" },
  "/approvals": { feature: FEATURES.APPROVALS, action: "read" },
  "/contracts": { feature: FEATURES.INFLUENCERS, action: "read" },
  "/alerts": { feature: FEATURES.ALERTS, action: "read" },
  "/inventory": { feature: FEATURES.INVENTORY, action: "read" },
  "/shipping": { feature: FEATURES.SHIPPING, action: "read" },
  "/tracking": { feature: FEATURES.TRACKING, action: "read" },
  "/payments": { feature: FEATURES.PAYMENTS, action: "read" },
  "/billing": { feature: FEATURES.BILLING, action: "read" },
};
