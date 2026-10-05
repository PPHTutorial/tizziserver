import { z } from "zod";
import { commerce } from "@stall/core";
import { withApi } from "@/src/http/route";

/** The caller's active cart for this tenant (multi-vendor grouped). */
export const GET = withApi({ auth: true }, async ({ ctx }) =>
  commerce.getCart({ userId: ctx.principal!.userId, platformSlug: ctx.platform }),
);

/** Empty the cart. `?keepSaved=0` also clears save-for-later. */
export const DELETE = withApi(
  { auth: true, query: z.object({ keepSaved: z.enum(["0", "1"]).optional() }), audit: "commerce.cart.clear" },
  async ({ ctx, query }) =>
    commerce.clearCart({ userId: ctx.principal!.userId, platformSlug: ctx.platform, includeSaved: query.keepSaved === "0" }),
);
/* Now the full building architecture covering these sectors as well: HEALTH, LEGAL, Digital, Research, Education then Enterprise(s) because we may expand or call for other sector enterprises like Finance, Agriculture, Marketing, Business and the rest later on. I am going by Docker (full fledged offline testing), then GCP and Cloudflare for real production roll out. Also, Vue, Flutter, Python, Go, Tauri & Rust, Nestjs for various pipelining; Vue for web frontend, flutter for Cross Mobile apps, Python for the real AI/RAG, Tauri & Rust for Desktop, Go */