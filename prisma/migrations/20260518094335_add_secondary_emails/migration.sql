-- AlterTable
ALTER TABLE "Influencer" ADD COLUMN "secondaryEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
