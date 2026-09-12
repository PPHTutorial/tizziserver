-- DropForeignKey
ALTER TABLE "business_documents" DROP CONSTRAINT "business_documents_businessId_fkey";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN     "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "themeColors" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "business_documents";

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

