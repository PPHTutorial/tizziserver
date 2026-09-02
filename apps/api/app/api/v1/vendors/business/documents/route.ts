import { z } from "zod";
import { catalog } from "@stall/core";
import { withApi } from "@/src/http/route";

/** KYC evidence documents on the caller's business. */
export const GET = withApi({ auth: "VENDOR" }, async ({ ctx }) => ({
  items: await catalog.listBusinessDocuments(ctx.principal!.userId),
}));

export const POST = withApi(
  {
    auth: "VENDOR",
    body: z.object({
      type: z.string().min(2).max(60),
      fileKey: z.string().min(3).max(300),
    }),
    rateLimit: { limit: 20, windowSec: 60, by: "principal" },
    audit: "vendor.document.add",
  },
  async ({ ctx, body }) => catalog.addBusinessDocument(ctx.principal!.userId, body.type, body.fileKey),
);
