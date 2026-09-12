-- AlterEnum
ALTER TYPE "NonWinnerPolicy" ADD VALUE 'NONE';

-- DropIndex
DROP INDEX "addresses_location_gist";

-- DropIndex
DROP INDEX "businesses_location_gist";

-- DropIndex
DROP INDEX "courier_profiles_lastLocation_gist";

-- DropIndex
DROP INDEX "courier_service_areas_area_gist";

-- DropIndex
DROP INDEX "delivery_zones_area_gist";

-- DropIndex
DROP INDEX "products_brand_trgm";

-- DropIndex
DROP INDEX "products_search_vector_gin";

-- DropIndex
DROP INDEX "products_title_trgm";

-- DropIndex
DROP INDEX "saved_locations_location_gist";
