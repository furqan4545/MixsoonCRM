DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailFolder') THEN
    CREATE TYPE "EmailFolder" AS ENUM ('INBOX', 'SENT', 'DRAFTS', 'SPAM', 'TRASH');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmailAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailAddress" TEXT NOT NULL,
  "displayName" TEXT,
  "signature" TEXT,
  "smtpHost" TEXT NOT NULL,
  "smtpPort" INTEGER NOT NULL,
  "imapHost" TEXT NOT NULL,
  "imapPort" INTEGER NOT NULL,
  "username" TEXT NOT NULL,
  "encryptedPass" TEXT NOT NULL,
  "lastSyncAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmailAccount"
ADD COLUMN IF NOT EXISTS "signature" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "EmailAccount_userId_key" ON "EmailAccount"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmailAccount_userId_fkey'
  ) THEN
    ALTER TABLE "EmailAccount"
    ADD CONSTRAINT "EmailAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmailMessage" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "messageId" TEXT,
  "inReplyTo" TEXT,
  "from" TEXT NOT NULL,
  "to" TEXT[] NOT NULL,
  "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT,
  "bodyText" TEXT,
  "attachmentsJson" TEXT,
  "folder" "EmailFolder" NOT NULL DEFAULT 'INBOX',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "isStarred" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "influencerId" TEXT,
  "threadId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmailMessage_accountId_fkey'
  ) THEN
    ALTER TABLE "EmailMessage"
    ADD CONSTRAINT "EmailMessage_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmailMessage_influencerId_fkey'
  ) THEN
    ALTER TABLE "EmailMessage"
    ADD CONSTRAINT "EmailMessage_influencerId_fkey"
    FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EmailMessage_accountId_idx" ON "EmailMessage"("accountId");
CREATE INDEX IF NOT EXISTS "EmailMessage_folder_idx" ON "EmailMessage"("folder");
CREATE INDEX IF NOT EXISTS "EmailMessage_influencerId_idx" ON "EmailMessage"("influencerId");
CREATE INDEX IF NOT EXISTS "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE INDEX IF NOT EXISTS "EmailMessage_isRead_idx" ON "EmailMessage"("isRead");
CREATE INDEX IF NOT EXISTS "EmailMessage_messageId_idx" ON "EmailMessage"("messageId");
