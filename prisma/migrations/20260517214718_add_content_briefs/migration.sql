-- AlterTable
ALTER TABLE "MarketingCampaign" ADD COLUMN "contentBriefBody" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN "contentBriefHashtags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ContentBriefOverride" (
    "id" TEXT NOT NULL,
    "marketingCampaignId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "ContentBriefOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentBriefOverride_marketingCampaignId_influencerId_key"
  ON "ContentBriefOverride"("marketingCampaignId", "influencerId");
CREATE INDEX "ContentBriefOverride_influencerId_idx" ON "ContentBriefOverride"("influencerId");

-- AddForeignKey
ALTER TABLE "ContentBriefOverride" ADD CONSTRAINT "ContentBriefOverride_marketingCampaignId_fkey"
  FOREIGN KEY ("marketingCampaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBriefOverride" ADD CONSTRAINT "ContentBriefOverride_influencerId_fkey"
  FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBriefOverride" ADD CONSTRAINT "ContentBriefOverride_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ContentBrief" (
    "id" TEXT NOT NULL,
    "marketingCampaignId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "hashtagsSnapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "plannedUploadDate" TIMESTAMP(3),
    "confirmedHashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextContentType" TEXT,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentBrief_token_key" ON "ContentBrief"("token");
CREATE INDEX "ContentBrief_influencerId_idx" ON "ContentBrief"("influencerId");
CREATE INDEX "ContentBrief_marketingCampaignId_idx" ON "ContentBrief"("marketingCampaignId");
CREATE INDEX "ContentBrief_sentAt_idx" ON "ContentBrief"("sentAt");

-- AddForeignKey
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_marketingCampaignId_fkey"
  FOREIGN KEY ("marketingCampaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_influencerId_fkey"
  FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentBrief" ADD CONSTRAINT "ContentBrief_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
