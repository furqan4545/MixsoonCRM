-- Remove maxTotalComments: comment limits are now controlled solely by commentsPerVideo × videosToSample
ALTER TABLE "AnalysisConfig" DROP COLUMN IF EXISTS "maxTotalComments";
