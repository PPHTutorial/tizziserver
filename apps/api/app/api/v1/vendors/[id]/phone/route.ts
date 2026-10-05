import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * Tap-to-reveal seller phone for the product page's "Show number". Signed-in
 * only, rate-limited and audited so numbers can't be bulk-scraped; listing
 * payloads only carry `vendor.phoneAvailable`.
 *
 * The limit uses a shared `bucket` so it spans ALL vendors — keyed on the
 * concrete path it would be 20/hour per vendor, i.e. unlimited scraping.
 */
export const GET = withApi(
  {
    auth: true,
    rateLimit: { limit: 20, windowSec: 3600, by: "principal", bucket: "vendor.phone.reveal" },
    audit: (r) => {
      const vendorId = (r.data as { vendorId?: string }).vendorId;
      return { action: "vendor.phone.reveal", targetType: "vendor", targetId: vendorId };
    },
  },
  async ({ params }) => ({ vendorId: params.id!, ...(await catalog.revealVendorPhone(params.id!)) }),
);
