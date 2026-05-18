-- Image attachments for the Notes tab. Stored as a JSON array on Influencer:
--   [{ id, gcsPath, name, size, type, uploadedAt, uploadedById }]
-- Files themselves live in GCS under  influencers/{id}/notes/...
ALTER TABLE "Influencer"
  ADD COLUMN "noteAttachments" JSONB NOT NULL DEFAULT '[]';
