-- AlterTable
ALTER TABLE "OnboardingToken" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "OnboardingToken_createdById_idx" ON "OnboardingToken"("createdById");

-- AddForeignKey
ALTER TABLE "OnboardingToken" ADD CONSTRAINT "OnboardingToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
