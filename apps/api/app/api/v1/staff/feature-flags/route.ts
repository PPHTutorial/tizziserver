import { z } from "zod";
import { admin } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ platformSlug: z.string(), flagKey: z.string(), value: z.unknown() });
export const GET = withApi({ auth: ["STAFF", "ADMIN"] }, async () => admin.listFeatureMatrix());
export const POST = withApi({ auth: ["ADMIN"], body: Body, audit: "feature_flag.set" }, async ({ body }) =>
  admin.setPlatformFeature(body.platformSlug, body.flagKey, body.value),
);
