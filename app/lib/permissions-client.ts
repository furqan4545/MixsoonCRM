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
  "/campaigns": { feature: FEATURES.AI_FILTER, action: "read" },
  "/queues": { feature: FEATURES.QUEUES, action: "read" },
  "/notifications": { feature: FEATURES.NOTIFICATIONS, action: "read" },
};
