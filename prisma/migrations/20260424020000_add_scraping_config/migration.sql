-- Global scraping settings (platform-wide Apify concurrency)
CREATE TABLE "ScrapingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "concurrency" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScrapingConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ScrapingConfig" ("id", "concurrency", "updatedAt")
VALUES ('default', 10, NOW())
ON CONFLICT ("id") DO NOTHING;
