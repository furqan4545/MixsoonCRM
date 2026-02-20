-- CreateEnum
CREATE TYPE "AiFilterRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PreFilterLabel" AS ENUM ('NONE', 'LIKELY_RELEVANT', 'REVIEW_QUEUE');

-- CreateEnum
CREATE TYPE "AiBucket" AS ENUM ('APPROVED', 'OKISH', 'REJECTED', 'REVIEW_QUEUE');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('NOT_REVIEWED', 'APPROVED_FOR_AI', 'DISCARDED');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetKeywords" TEXT[],
    "avoidKeywords" TEXT[],
    "notes" TEXT,
    "strictnessDefault" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFilterRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "importId" TEXT,
    "strictness" INTEGER NOT NULL,
    "status" "AiFilterRunStatus" NOT NULL DEFAULT 'PENDING',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "aiProcessedCount" INTEGER NOT NULL DEFAULT 0,
    "reviewQueueCount" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "okishCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFilterRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfluencerAiEvaluation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "prefilterLabel" "PreFilterLabel" NOT NULL,
    "score" INTEGER,
    "bucket" "AiBucket" NOT NULL,
    "reasons" TEXT,
    "matchedSignals" TEXT,
    "riskSignals" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfluencerAiEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_name_idx" ON "Campaign"("name");

-- CreateIndex
CREATE INDEX "AiFilterRun_campaignId_idx" ON "AiFilterRun"("campaignId");

-- CreateIndex
CREATE INDEX "AiFilterRun_importId_idx" ON "AiFilterRun"("importId");

-- CreateIndex
CREATE INDEX "AiFilterRun_status_idx" ON "AiFilterRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InfluencerAiEvaluation_runId_influencerId_key" ON "InfluencerAiEvaluation"("runId", "influencerId");

-- CreateIndex
CREATE INDEX "InfluencerAiEvaluation_runId_idx" ON "InfluencerAiEvaluation"("runId");

-- CreateIndex
CREATE INDEX "InfluencerAiEvaluation_influencerId_idx" ON "InfluencerAiEvaluation"("influencerId");

-- CreateIndex
CREATE INDEX "InfluencerAiEvaluation_bucket_idx" ON "InfluencerAiEvaluation"("bucket");

-- CreateIndex
CREATE INDEX "InfluencerAiEvaluation_reviewStatus_idx" ON "InfluencerAiEvaluation"("reviewStatus");

-- AddForeignKey
ALTER TABLE "AiFilterRun" ADD CONSTRAINT "AiFilterRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFilterRun" ADD CONSTRAINT "AiFilterRun_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerAiEvaluation" ADD CONSTRAINT "InfluencerAiEvaluation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiFilterRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfluencerAiEvaluation" ADD CONSTRAINT "InfluencerAiEvaluation_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
