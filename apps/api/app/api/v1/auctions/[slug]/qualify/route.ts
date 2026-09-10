import { z } from "zod";
import { auctions } from "@stall/core";
import { withApi } from "@/src/http/route";
const Body = z.object({ factor: z.enum(["ENGAGEMENT","SHARE","REFERRAL"]), key: z.string().max(120).optional(), points: z.number().positive().max(25).optional(), ref: z.record(z.string(), z.unknown()).optional() });
export const POST = withApi({ auth: true, capability: "auction", body: Body, audit: "auction.qualify" }, async ({ ctx, params, body }) => auctions.recordQualification(ctx.principal!.userId, params.slug!, body.factor, body));

