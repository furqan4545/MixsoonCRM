-- DropIndex
DROP INDEX IF EXISTS "Import_autoDeleteAt_idx";

-- AlterTable
ALTER TABLE "Import" DROP COLUMN IF EXISTS "autoDeleteAt";
