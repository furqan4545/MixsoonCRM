-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "confirmToken" TEXT;
ALTER TABLE "Payment" ADD COLUMN "confirmTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "confirmedByUserId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "confirmedByEmail" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_confirmToken_key" ON "Payment"("confirmToken");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
