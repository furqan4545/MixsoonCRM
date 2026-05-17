-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "proofRequestedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "proofSentAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "proofSentMessage" TEXT;
ALTER TABLE "Payment" ADD COLUMN "proofFiles" JSONB;
ALTER TABLE "Payment" ADD COLUMN "proofSentByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_proofSentByUserId_fkey" FOREIGN KEY ("proofSentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
