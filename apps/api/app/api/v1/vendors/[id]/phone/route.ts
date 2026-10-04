import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/**
 * Tap-to-reveal seller phone for the product page's "Show number". Signed-in
 * only, rate-limited and audited so numbers can't be bulk-scraped; listing
 * payloads only carry `vendor.phoneAvailable`.
 */
export const GET = withApi(
  { auth: true, rateLimit: { limit: 20, windowSec: 3600, by: "principal" }, audit: "vendor.phone.reveal" },
  async ({ params }) => catalog.revealVendorPhone(params.id!),
);
