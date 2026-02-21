ALTER TABLE "Notification" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'info';
CREATE INDEX "Notification_status_idx" ON "Notification"("status");
