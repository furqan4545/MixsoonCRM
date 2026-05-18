-- Drop the influencer-response/public-token columns from ContentBrief.
-- The brief is now strictly one-way (team → influencer email); no public form.
DROP INDEX IF EXISTS "ContentBrief_token_key";

ALTER TABLE "ContentBrief"
  DROP COLUMN IF EXISTS "token",
  DROP COLUMN IF EXISTS "tokenExpiresAt",
  DROP COLUMN IF EXISTS "respondedAt",
  DROP COLUMN IF EXISTS "plannedUploadDate",
  DROP COLUMN IF EXISTS "confirmedHashtags",
  DROP COLUMN IF EXISTS "nextContentType";

-- Add new structured fields that WE fill in and send to the influencer.
ALTER TABLE "ContentBrief"
  ADD COLUMN "howToPostSnapshot" TEXT,
  ADD COLUMN "uploadDate" TIMESTAMP(3),
  ADD COLUMN "notes" TEXT;

-- Campaign-level default for "how to post" — overridable per-influencer.
ALTER TABLE "MarketingCampaign"
  ADD COLUMN "contentBriefHowToPost" TEXT;

-- Same field on the per-influencer override.
ALTER TABLE "ContentBriefOverride"
  ADD COLUMN "howToPost" TEXT;
