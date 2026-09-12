-- AlterTable
ALTER TABLE "brand_logos" ADD COLUMN     "variants" JSONB NOT NULL DEFAULT '[]';
