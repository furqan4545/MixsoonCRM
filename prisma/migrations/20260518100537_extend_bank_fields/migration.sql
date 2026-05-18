-- Extend bank-detail snapshots across InfluencerOnboarding, ContentSubmission,
-- and Payment with IBAN, routing number, CC code and bank address. IBAN and
-- routing are stored encrypted at rest (same AES-256 helper as accountNumber).

ALTER TABLE "InfluencerOnboarding"
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "routingNumber" TEXT,
  ADD COLUMN "ccCode" TEXT,
  ADD COLUMN "bankAddress" TEXT;

ALTER TABLE "ContentSubmission"
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "routingNumber" TEXT,
  ADD COLUMN "ccCode" TEXT,
  ADD COLUMN "bankAddress" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "iban" TEXT,
  ADD COLUMN "routingNumber" TEXT,
  ADD COLUMN "ccCode" TEXT,
  ADD COLUMN "bankAddress" TEXT;
