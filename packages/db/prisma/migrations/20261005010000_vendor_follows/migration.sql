-- CreateTable
CREATE TABLE "vendor_follows" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_follows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_follows_vendorId_idx" ON "vendor_follows"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_follows_userId_vendorId_key" ON "vendor_follows"("userId", "vendorId");

-- AddForeignKey
ALTER TABLE "vendor_follows" ADD CONSTRAINT "vendor_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_follows" ADD CONSTRAINT "vendor_follows_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
