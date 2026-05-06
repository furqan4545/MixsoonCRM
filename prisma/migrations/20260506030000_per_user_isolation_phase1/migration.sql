-- ============================================================================
-- Phase 1 of per-user data isolation.
-- ----------------------------------------------------------------------------
-- 1. Adds nullable `createdById` columns + FKs + indexes to every owned model.
-- 2. Backfills existing rows to the CEO admin user (only admin in the DB).
-- 3. Creates ResourceShare (per-resource sharing) + SystemSetting (admin-isolation
--    flag) tables.
-- ----------------------------------------------------------------------------
-- This migration does NOT change query behavior. Phase 2 will add ownership
-- filters to API routes; until then everyone still sees everything (the
-- columns are just populated for future use).
-- ============================================================================

-- ---------- AlterTable: add createdById columns ----------
ALTER TABLE "Influencer"        ADD COLUMN "createdById" TEXT;
ALTER TABLE "ActivityLog"       ADD COLUMN "createdById" TEXT;
ALTER TABLE "Import"            ADD COLUMN "createdById" TEXT;
ALTER TABLE "Campaign"          ADD COLUMN "createdById" TEXT;
ALTER TABLE "AiFilterRun"       ADD COLUMN "createdById" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "createdById" TEXT;
ALTER TABLE "AlertRule"         ADD COLUMN "createdById" TEXT;
ALTER TABLE "EmailTemplate"     ADD COLUMN "createdById" TEXT;
ALTER TABLE "EmailAlert"        ADD COLUMN "createdById" TEXT;
ALTER TABLE "ContractTemplate"  ADD COLUMN "createdById" TEXT;
ALTER TABLE "Contract"          ADD COLUMN "createdById" TEXT;
ALTER TABLE "ContentSubmission" ADD COLUMN "createdById" TEXT;
ALTER TABLE "AnalysisRun"       ADD COLUMN "createdById" TEXT;
ALTER TABLE "AnalysisConfig"    ADD COLUMN "createdById" TEXT;
ALTER TABLE "ScrapingConfig"    ADD COLUMN "createdById" TEXT;
ALTER TABLE "BudgetConfig"      ADD COLUMN "createdById" TEXT;
ALTER TABLE "Product"           ADD COLUMN "createdById" TEXT;
ALTER TABLE "TrackedVideo"      ADD COLUMN "createdById" TEXT;
ALTER TABLE "ViralAlertConfig"  ADD COLUMN "createdById" TEXT;

-- ---------- Backfill: assign all existing rows to the CEO admin ----------
-- Resolved at runtime so we don't hard-code the user id.
DO $$
DECLARE
  admin_id TEXT;
BEGIN
  SELECT u."id" INTO admin_id
  FROM "User" u
  JOIN "Role" r ON r."id" = u."roleId"
  WHERE r."name" = 'Admin'
  ORDER BY u."createdAt" ASC
  LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No Admin user found — cannot backfill createdById. Create an Admin user first.';
  END IF;

  UPDATE "Influencer"        SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "ActivityLog"       SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "Import"            SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "Campaign"          SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "AiFilterRun"       SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "MarketingCampaign" SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "AlertRule"         SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "EmailTemplate"     SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "EmailAlert"        SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "ContractTemplate"  SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "Contract"          SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "ContentSubmission" SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "AnalysisRun"       SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "AnalysisConfig"    SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "ScrapingConfig"    SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "BudgetConfig"      SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "Product"           SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "TrackedVideo"      SET "createdById" = admin_id WHERE "createdById" IS NULL;
  UPDATE "ViralAlertConfig"  SET "createdById" = admin_id WHERE "createdById" IS NULL;
END $$;

-- ---------- Indexes ----------
CREATE INDEX "Influencer_createdById_idx"        ON "Influencer"("createdById");
CREATE INDEX "ActivityLog_createdById_idx"       ON "ActivityLog"("createdById");
CREATE INDEX "Import_createdById_idx"            ON "Import"("createdById");
CREATE INDEX "Campaign_createdById_idx"          ON "Campaign"("createdById");
CREATE INDEX "AiFilterRun_createdById_idx"       ON "AiFilterRun"("createdById");
CREATE INDEX "MarketingCampaign_createdById_idx" ON "MarketingCampaign"("createdById");
CREATE INDEX "AlertRule_createdById_idx"         ON "AlertRule"("createdById");
CREATE INDEX "EmailTemplate_createdById_idx"     ON "EmailTemplate"("createdById");
CREATE INDEX "EmailAlert_createdById_idx"        ON "EmailAlert"("createdById");
CREATE INDEX "ContractTemplate_createdById_idx"  ON "ContractTemplate"("createdById");
CREATE INDEX "Contract_createdById_idx"          ON "Contract"("createdById");
CREATE INDEX "ContentSubmission_createdById_idx" ON "ContentSubmission"("createdById");
CREATE INDEX "AnalysisRun_createdById_idx"       ON "AnalysisRun"("createdById");
CREATE INDEX "AnalysisConfig_createdById_idx"    ON "AnalysisConfig"("createdById");
CREATE INDEX "ScrapingConfig_createdById_idx"    ON "ScrapingConfig"("createdById");
CREATE INDEX "BudgetConfig_createdById_idx"      ON "BudgetConfig"("createdById");
CREATE INDEX "Product_createdById_idx"           ON "Product"("createdById");
CREATE INDEX "TrackedVideo_createdById_idx"      ON "TrackedVideo"("createdById");
CREATE INDEX "ViralAlertConfig_createdById_idx"  ON "ViralAlertConfig"("createdById");

-- ---------- Foreign Keys ----------
ALTER TABLE "Influencer"        ADD CONSTRAINT "Influencer_createdById_fkey"        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog"       ADD CONSTRAINT "ActivityLog_createdById_fkey"       FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Import"            ADD CONSTRAINT "Import_createdById_fkey"            FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign"          ADD CONSTRAINT "Campaign_createdById_fkey"          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiFilterRun"       ADD CONSTRAINT "AiFilterRun_createdById_fkey"       FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AlertRule"         ADD CONSTRAINT "AlertRule_createdById_fkey"         FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailTemplate"     ADD CONSTRAINT "EmailTemplate_createdById_fkey"     FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailAlert"        ADD CONSTRAINT "EmailAlert_createdById_fkey"        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractTemplate"  ADD CONSTRAINT "ContractTemplate_createdById_fkey"  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Contract"          ADD CONSTRAINT "Contract_createdById_fkey"          FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentSubmission" ADD CONSTRAINT "ContentSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalysisRun"       ADD CONSTRAINT "AnalysisRun_createdById_fkey"       FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalysisConfig"    ADD CONSTRAINT "AnalysisConfig_createdById_fkey"    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScrapingConfig"    ADD CONSTRAINT "ScrapingConfig_createdById_fkey"    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetConfig"      ADD CONSTRAINT "BudgetConfig_createdById_fkey"      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product"           ADD CONSTRAINT "Product_createdById_fkey"           FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackedVideo"      ADD CONSTRAINT "TrackedVideo_createdById_fkey"      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ViralAlertConfig"  ADD CONSTRAINT "ViralAlertConfig_createdById_fkey"  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- New table: ResourceShare ----------
CREATE TABLE "ResourceShare" (
  "id"           TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId"   TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "permission"   TEXT NOT NULL DEFAULT 'read',
  "sharedById"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResourceShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceShare_resourceType_resourceId_userId_key" ON "ResourceShare"("resourceType", "resourceId", "userId");
CREATE INDEX "ResourceShare_userId_idx"                ON "ResourceShare"("userId");
CREATE INDEX "ResourceShare_resourceType_resourceId_idx" ON "ResourceShare"("resourceType", "resourceId");
CREATE INDEX "ResourceShare_sharedById_idx"            ON "ResourceShare"("sharedById");

ALTER TABLE "ResourceShare" ADD CONSTRAINT "ResourceShare_userId_fkey"     FOREIGN KEY ("userId")     REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResourceShare" ADD CONSTRAINT "ResourceShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- New table: SystemSetting ----------
CREATE TABLE "SystemSetting" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- Default: admins still see all data. Toggle to 'true' to make admins isolated.
INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
VALUES ('admin_isolation_enabled', 'false', CURRENT_TIMESTAMP);
