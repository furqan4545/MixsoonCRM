-- Add deterministic pre-filter fields to Campaign
ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "maxDaysSinceLastPost" INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "minFollowers" INTEGER,
  ADD COLUMN IF NOT EXISTS "minVideoCount" INTEGER;

-- Extend PreFilterLabel enum with DETERMINISTIC_REJECTED
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'DETERMINISTIC_REJECTED'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PreFilterLabel')
  ) THEN
    ALTER TYPE "PreFilterLabel" ADD VALUE 'DETERMINISTIC_REJECTED';
  END IF;
END $$;
