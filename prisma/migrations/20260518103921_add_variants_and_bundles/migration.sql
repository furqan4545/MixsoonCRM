-- Product variants: shades, sizes, or any "this product comes in N flavors" axis.
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bundles: a named reusable selection of products. One bundle, many sends.
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Bundle_region_idx" ON "Bundle"("region");
CREATE INDEX "Bundle_createdById_idx" ON "Bundle"("createdById");

ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BundleItem: items inside a bundle (product + optional variant + qty).
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BundleItem_bundleId_idx" ON "BundleItem"("bundleId");
CREATE INDEX "BundleItem_productId_idx" ON "BundleItem"("productId");
CREATE INDEX "BundleItem_variantId_idx" ON "BundleItem"("variantId");

ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Shipments can reference a variant (which shade was sent) and a bundle
-- (which bundle this shipment was created from, for grouping/reporting).
ALTER TABLE "Shipment" ADD COLUMN "variantId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "bundleId" TEXT;

CREATE INDEX "Shipment_variantId_idx" ON "Shipment"("variantId");
CREATE INDEX "Shipment_bundleId_idx" ON "Shipment"("bundleId");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
